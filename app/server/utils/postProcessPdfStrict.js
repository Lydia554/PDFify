// Helpers: postProcessPdfStrict.js
const { PDFDocument, PDFName, PDFHexString } = require("pdf-lib");
const fs = require("fs");

/**
 * Post-process PDF to:
 *  - embed ZUGFeRD XML (optional)
 *  - embed XMP metadata as a proper stream (xpacket wrapped)
 *  - add OutputIntents array with registered ICC profile
 *  - log each step for validator visibility
 *
 * @param {Uint8Array|Buffer} pdfBytes
 * @param {string} iccPath
 * @param {string} xmpFilePath
 * @param {string|null} zugferdXml
 * @returns {Promise<Buffer>}
 */
async function postProcessPdfStrict(pdfBytes, iccPath, xmpFilePath, zugferdXml = null) {
  const pdfDoc = await PDFDocument.load(pdfBytes);

  console.log("🔹 Loaded PDF, pages:", pdfDoc.getPageCount());

  // -------------------
  // 1) Embed ZUGFeRD XML
  // -------------------
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

    // /Names/EmbeddedFiles
    let names = pdfDoc.catalog.lookup(PDFName.of("Names")) || pdfDoc.context.obj({});
    pdfDoc.catalog.set(PDFName.of("Names"), names);

    let embeddedFiles = names.lookup(PDFName.of("EmbeddedFiles")) || pdfDoc.context.obj({ Names: [] });
    names.set(PDFName.of("EmbeddedFiles"), embeddedFiles);

    let namesArray = embeddedFiles.lookup(PDFName.of("Names")) || pdfDoc.context.obj([]);
    namesArray.push(PDFHexString.of(fileName));
    namesArray.push(filespecRef);
    embeddedFiles.set(PDFName.of("Names"), namesArray);

    // /AF array
    pdfDoc.catalog.set(PDFName.of("AF"), pdfDoc.context.obj([filespecRef]));

    console.log("✅ Embedded ZUGFeRD XML, /AF and /Names updated");
  }

  // -------------------
  // 2) Embed ICC profile and OutputIntent
  // -------------------
  if (!fs.existsSync(iccPath)) throw new Error("ICC profile missing at " + iccPath);

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
  const outputIntentRef = pdfDoc.context.register(outputIntentDict);
  pdfDoc.catalog.set(PDFName.of("OutputIntents"), pdfDoc.context.obj([outputIntentRef]));

  console.log("✅ OutputIntent added with ICC profile, registered reference used");

  // Set ColorSpace and Transparency Group for each page
  const pages = pdfDoc.getPages();
  pages.forEach(page => {
    const pageDict = pdfDoc.context.lookup(page.ref);
    let resources = pageDict.lookup(PDFName.of("Resources")) || pdfDoc.context.obj({});
    pageDict.set(PDFName.of("Resources"), resources);

    resources.set(
      PDFName.of("ColorSpace"),
      pdfDoc.context.obj({
        DefaultRGB: pdfDoc.context.obj([PDFName.of("ICCBased"), iccRef]),
        DefaultGray: pdfDoc.context.obj([PDFName.of("ICCBased"), iccRef]),
      })
    );

    pageDict.set(
      PDFName.of("Group"),
      pdfDoc.context.obj({
        Type: PDFName.of("Group"),
        S: PDFName.of("Transparency"),
        CS: pdfDoc.context.obj([PDFName.of("ICCBased"), iccRef]),
      })
    );
  });

  console.log(`🔹 Updated ${pages.length} pages with default color spaces and transparency group`);

  // -------------------
  // 3) Embed XMP metadata
  // -------------------
  let xmpData = '';
  if (xmpFilePath && fs.existsSync(xmpFilePath)) {
    xmpData = fs.readFileSync(xmpFilePath, "utf8").trim();
    if (!xmpData.includes("<?xpacket")) {
      xmpData = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n${xmpData}\n<?xpacket end="w"?>`;
    }
  } else {
    // minimal xmp
    xmpData = '<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"></rdf:RDF><?xpacket end="w"?>';
  }

  const metadataStream = pdfDoc.context.flateStream(Buffer.from(xmpData, "utf8"), {
    Type: PDFName.of("Metadata"),
    Subtype: PDFName.of("XML"),
    Filter: PDFName.of("FlateDecode"),
  });
  const metadataRef = pdfDoc.context.register(metadataStream);
  pdfDoc.catalog.set(PDFName.of("Metadata"), metadataRef);

  console.log("✅ XMP metadata stream embedded");

  // -------------------
  // Save final PDF
  // -------------------
  const out = await pdfDoc.save();
  console.log("📄 PDF post-processing complete");
  return Buffer.from(out);
}

module.exports = { postProcessPdfStrict };
