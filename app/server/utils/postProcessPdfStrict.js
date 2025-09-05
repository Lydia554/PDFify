// postProcessPdfStrict.js
const { PDFDocument, PDFName, PDFHexString, PDFStream } = require("pdf-lib");
const fs = require("fs");
const path = require("path");

/**
 * Post-process PDF to PDF/A-3b compliant
 * @param {Uint8Array|Buffer} pdfBytes
 * @param {string} iccPath
 * @param {string|null} xmpFilePath
 * @param {string|null} zugferdXml
 * @returns {Promise<Buffer>}
 */
async function postProcessPdf(pdfBytes, iccPath, xmpFilePath, zugferdXml = null) {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const catalog = pdfDoc.catalog;

  /** ---------------- ZUGFeRD XML ---------------- */
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

    // Names -> EmbeddedFiles -> Names array
    let names = catalog.lookup(PDFName.of("Names")) || pdfDoc.context.obj({});
    catalog.set(PDFName.of("Names"), names);

    let embeddedFiles = names.lookup(PDFName.of("EmbeddedFiles")) || pdfDoc.context.obj({ Names: [] });
    names.set(PDFName.of("EmbeddedFiles"), embeddedFiles);

    let namesArray = embeddedFiles.lookup(PDFName.of("Names")) || pdfDoc.context.obj([]);
    embeddedFiles.set(PDFName.of("Names"), namesArray);

    namesArray.push(PDFHexString.of(fileName));
    namesArray.push(filespecRef);

    // Add AF array to catalog
    catalog.set(PDFName.of("AF"), pdfDoc.context.obj([filespecRef]));
  }

  /** ---------------- ICC / OutputIntents ---------------- */
  if (!fs.existsSync(iccPath)) throw new Error("ICC profile missing: " + iccPath);
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

  // ✅ Proper array of dicts (no double register)
  const outputIntentsArray = pdfDoc.context.obj([outputIntentDict]);
  catalog.set(PDFName.of("OutputIntents"), outputIntentsArray);

/** ---------------- XMP Metadata ---------------- */
let xmpContent;
if (xmpFilePath && fs.existsSync(xmpFilePath)) {
  xmpContent = fs.readFileSync(xmpFilePath, "utf8").trim();
  if (!xmpContent.includes("<?xpacket")) {
    xmpContent = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n${xmpContent}\n<?xpacket end="w"?>`;
  }
} else {
  xmpContent = '<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"></rdf:RDF><?xpacket end="w"?>';
}

const xmpBuffer = Buffer.from(xmpContent, "utf8");

// Use flateStream like OutputIntent
const metadataStream = pdfDoc.context.flateStream(xmpBuffer, {
  Type: PDFName.of("Metadata"),
  Subtype: PDFName.of("XML"),
  Filter: PDFName.of("FlateDecode"),
});
const metadataRef = pdfDoc.context.register(metadataStream);
catalog.set(PDFName.of("Metadata"), metadataRef);




  /** ---------------- Page Resources / Transparency ---------------- */
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

  /** ---------------- Debug logs ---------------- */
  console.log("✅ PostProcess Debug:");
  console.log("Catalog keys:", catalog.keys().map(k => k.value()));
  console.log("OutputIntents type:", catalog.lookup(PDFName.of("OutputIntents")).constructor.name);
  console.log("Metadata type:", catalog.lookup(PDFName.of("Metadata")).constructor.name);
  console.log("Metadata size:", xmpBuffer.length);
  console.log("Pages:", pages.length);

  /** ---------------- Save final PDF ---------------- */
  return Buffer.from(await pdfDoc.save());
}

module.exports = { postProcessPdf };
