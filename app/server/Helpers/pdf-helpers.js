const fs = require("fs");
const path = require("path");
const { PDFDocument, PDFName, PDFHexString } = require("pdf-lib");
const generateZugferdXml = require("../../xml/generateZugferdXml");

// -----------------------------
// Helper: Clean PDF buffer
// -----------------------------
function cleanPdfBuffer(buf) {
  const pdfStart = buf.indexOf(Buffer.from("%PDF-"));
  return pdfStart > 0 ? buf.slice(pdfStart) : buf;
}



// -----------------------------
// Embed ZUGFeRD XML into PDF
// -----------------------------
async function embedZugferdXml(pdfDoc, invoiceData) {
  const xmlString = generateZugferdXml(invoiceData);

  // Create XML stream
  const xmlStream = pdfDoc.context.flateStream(Buffer.from(xmlString, "utf8"), {
    Type: PDFName.of("EmbeddedFile"),
    Subtype: PDFName.of("text#2Fxml"),
    Params: pdfDoc.context.obj({
      ModDate: new Date().toISOString(),
    }),
  });
  const xmlRef = pdfDoc.context.register(xmlStream);

  // Create file spec
const fileSpec = pdfDoc.context.obj({
  Type: PDFName.of("Filespec"),
  F: PDFHexString.fromText(`ZUGFeRD-invoice-${invoiceData.orderId}.xml`),
  UF: PDFHexString.fromText(`ZUGFeRD-invoice-${invoiceData.orderId}.xml`),
  EF: pdfDoc.context.obj({ F: xmlRef }),
  AFRelationship: PDFName.of("Alternative"),
});

  const fileSpecRef = pdfDoc.context.register(fileSpec);

  // Attach file to EmbeddedFiles dictionary
  let names = pdfDoc.catalog.lookupMaybe(PDFName.of("Names"));
  if (!names) {
    names = pdfDoc.context.obj({
      EmbeddedFiles: pdfDoc.context.obj({
        Names: [PDFHexString.fromText(`ZUGFeRD-invoice-${invoiceData.orderId}.xml`), fileSpecRef],
      }),
    });
    pdfDoc.catalog.set(PDFName.of("Names"), names);
  } else {
    const embeddedFiles = names.lookupMaybe(PDFName.of("EmbeddedFiles"));
    if (embeddedFiles) {
      const namesArray = embeddedFiles.lookup(PDFName.of("Names"));
      namesArray.push(PDFHexString.fromText(`ZUGFeRD-invoice-${invoiceData.orderId}.xml`), fileSpecRef);
    }
  }

  // Add AF entry (associated files)
  const afArray = pdfDoc.context.obj([fileSpecRef]);
  pdfDoc.catalog.set(PDFName.of("AF"), afArray);

  return pdfDoc;
}

// -----------------------------
// Finalize PDF: Add XMP + ZUGFeRD XML
// -----------------------------
async function finalizePdf(originalPdfBuffer, invoiceData) {
  const cleanBuffer = cleanPdfBuffer(originalPdfBuffer);
  const pdfDoc = await PDFDocument.load(cleanBuffer);

  await embedXmp(pdfDoc);
  await embedZugferdXml(pdfDoc, invoiceData);

  const finalBuffer = await pdfDoc.save({ useObjectStreams: false });
  return finalBuffer;
}

module.exports = {
  cleanPdfBuffer,
  embedXmp,
  embedZugferdXml,
  finalizePdf,
};
