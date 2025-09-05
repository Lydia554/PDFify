// Helpers: postProcessPdf.js (or paste into your route file above the route)
const { PDFName, PDFHexString } = require("pdf-lib");
const path = require("path");
const fs = require("fs");

/**
 * Ensure final PDF contains:
 *  - embedded ZUGFeRD XML (Filespec + /AF)
 *  - XMP metadata as an actual metadata stream (xpacket wrapped)
 *  - OutputIntents array with DestOutputProfile referencing an ICC stream
 *
 * @param {Uint8Array|Buffer} pdfBytes
 * @param {string} iccPath - path to ICC profile
 * @param {string} xmpFilePath - path to XMP XML (can be plain xml or already xpacket wrapped)
 * @param {string|null} zugferdXml - optional XML string to embed (if provided)
 * @returns {Promise<Buffer>} final PDF bytes
 */
async function postProcessPdf(pdfBytes, iccPath, xmpFilePath, zugferdXml = null) {
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // 1) embed ZUGFeRD XML (if provided)
  let filespecRef = null;
  if (zugferdXml) {
    const xmlBuffer = Buffer.from(zugferdXml, "utf8");
    const embeddedFileStream = pdfDoc.context.flateStream(xmlBuffer, {
      Type: PDFName.of("EmbeddedFile"),
      Subtype: PDFName.of("application/xml"),
    });
    const embeddedFileRef = pdfDoc.context.register(embeddedFileStream);

    const fileName = "zugferd-invoice.xml";
    const efDict = pdfDoc.context.obj({ F: embeddedFileRef, UF: embeddedFileRef });
    const filespecDict = pdfDoc.context.obj({
      Type: PDFName.of("Filespec"),
      F: PDFHexString.of(fileName),
      UF: PDFHexString.of(fileName),
      EF: efDict,
      Desc: PDFHexString.of("ZUGFeRD invoice XML"),
      AFRelationship: PDFName.of("Data"),
    });
    filespecRef = pdfDoc.context.register(filespecDict);

    // Names -> EmbeddedFiles -> Names array [name, filespecRef, ...]
    let names = pdfDoc.catalog.lookup(PDFName.of("Names"));
    if (!names) {
      names = pdfDoc.context.obj({});
      pdfDoc.catalog.set(PDFName.of("Names"), names);
    }
    let embeddedFiles = names.lookup(PDFName.of("EmbeddedFiles"));
    if (!embeddedFiles) {
      embeddedFiles = pdfDoc.context.obj({ Names: [] });
      names.set(PDFName.of("EmbeddedFiles"), embeddedFiles);
    }
    let namesArray = embeddedFiles.lookup(PDFName.of("Names"));
    if (!namesArray) {
      namesArray = pdfDoc.context.obj([]);
      embeddedFiles.set(PDFName.of("Names"), namesArray);
    }
    // Append name (as PDFHexString) and filespecRef
    namesArray.push(PDFHexString.of(fileName));
    namesArray.push(filespecRef);

    // Add AF (array of filespecs) to catalog
    pdfDoc.catalog.set(PDFName.of("AF"), pdfDoc.context.obj([filespecRef]));
  }

  // 2) embed ICC profile as a stream and add OutputIntents
  if (fs.existsSync(iccPath)) {
    const iccData = fs.readFileSync(iccPath);
    const iccStream = pdfDoc.context.flateStream(iccData, {
      N: 3,
      Alternate: PDFName.of("DeviceRGB"),
      Filter: PDFName.of("FlateDecode"),
    });
    const iccRef = pdfDoc.context.register(iccStream);

    const outputIntentDict = pdfDoc.context.obj({
      Type: PDFName.of("OutputIntent"),
      S: PDFName.of("GTS_PDFA3"),
      OutputConditionIdentifier: PDFHexString.of("sRGB IEC61966-2.1"),
      Info: PDFHexString.of("sRGB IEC61966-2.1"),
      OutputCondition: PDFHexString.of("sRGB IEC61966-2.1"),
      RegistryName: PDFHexString.of("http://www.color.org"),
      DestOutputProfile: iccRef,
    });
    pdfDoc.catalog.set(
      PDFName.of("OutputIntents"),
      pdfDoc.context.obj([pdfDoc.context.register(outputIntentDict)])
    );

    // Set default ColorSpace entries in Resources for each page (helps some validators)
    const pages = pdfDoc.getPages();
    pages.forEach(page => {
      try {
        const pageDict = pdfDoc.context.lookup(page.ref);
        let resources = pageDict.lookup(PDFName.of("Resources"));
        if (!resources) {
          resources = pdfDoc.context.obj({});
          pageDict.set(PDFName.of("Resources"), resources);
        }
        // Set ColorSpace dictionary
        resources.set(
          PDFName.of("ColorSpace"),
          pdfDoc.context.obj({
            DefaultRGB: pdfDoc.context.obj([PDFName.of("ICCBased"), iccRef]),
            DefaultGray: pdfDoc.context.obj([PDFName.of("ICCBased"), iccRef]),
          })
        );
        // Add Transparency Group CS (optional)
        pageDict.set(
          PDFName.of("Group"),
          pdfDoc.context.obj({
            Type: PDFName.of("Group"),
            S: PDFName.of("Transparency"),
            CS: pdfDoc.context.obj([PDFName.of("ICCBased"), iccRef]),
          })
        );
      } catch (e) {
        // ignore page-level issues
      }
    });
  } else {
    throw new Error("ICC profile missing at postProcessPdf: " + iccPath);
  }

  // 3) Embed XMP metadata as a real metadata stream (xpacket wrapper)
  if (xmpFilePath && fs.existsSync(xmpFilePath)) {
    let rawXmp = fs.readFileSync(xmpFilePath, "utf8").trim();
    // Ensure xpacket wrapper (validator often expects xpacket)
    if (!rawXmp.includes("<?xpacket")) {
      rawXmp = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n${rawXmp}\n<?xpacket end="w"?>`;
    }
    const xmpBuffer = Buffer.from(rawXmp, "utf8");
    const metadataStream = pdfDoc.context.flateStream(xmpBuffer, {
      Type: PDFName.of("Metadata"),
      Subtype: PDFName.of("XML"),
      Filter: PDFName.of("FlateDecode"),
    });
    const metadataRef = pdfDoc.context.register(metadataStream);
    pdfDoc.catalog.set(PDFName.of("Metadata"), metadataRef);
  } else {
    // If there is no xmp file, still create a minimal XMP packet from document info
    const minimalXmp = '<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"></rdf:RDF><?xpacket end="w"?>';
    const metadataStream = pdfDoc.context.flateStream(Buffer.from(minimalXmp, "utf8"), {
      Type: PDFName.of("Metadata"),
      Subtype: PDFName.of("XML"),
      Filter: PDFName.of("FlateDecode"),
    });
    const metadataRef = pdfDoc.context.register(metadataStream);
    pdfDoc.catalog.set(PDFName.of("Metadata"), metadataRef);
  }

  // Save final PDF
  const out = await pdfDoc.save();
  return Buffer.from(out);
}

module.exports = { postProcessPdf };
