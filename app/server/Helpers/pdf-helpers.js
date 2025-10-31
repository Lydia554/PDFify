const fs = require("fs");
const path = require("path");
const os = require("os");
const { PDFDocument, PDFName} = require("pdf-lib");

// -----------------------------
// Helper: Clean PDF buffer
// -----------------------------
function cleanPdfBuffer(buf) {
  const pdfStart = buf.indexOf(Buffer.from("%PDF-"));
  return pdfStart > 0 ? buf.slice(pdfStart) : buf;
}

// -----------------------------
// Embed XMP metadata into PDF
// -----------------------------
async function embedXmp(pdfDoc) {
  const xmp = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"
      pdfaid:part="3"
      pdfaid:conformance="B"/>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

  const metadataStream = pdfDoc.context.flateStream(Buffer.from(xmp, "utf8"), {
    Type: PDFName.of("Metadata"),
    Subtype: PDFName.of("XML"),
    Filter: PDFName.of("FlateDecode"),
  });

  const metadataRef = pdfDoc.context.register(metadataStream);
  pdfDoc.catalog.set(PDFName.of("Metadata"), metadataRef);
  pdfDoc.catalog.set(PDFName.of("MarkInfo"), pdfDoc.context.obj({ Marked: true }));

  return pdfDoc;
}

// -----------------------------
// Finalize PDF (no XML embedding in Node)
// -----------------------------
async function finalizePdf(originalPdfBuffer) {
  const cleanBuffer = cleanPdfBuffer(originalPdfBuffer);
  const pdfDoc = await PDFDocument.load(cleanBuffer);
  await embedXmp(pdfDoc);
  const finalBuffer = await pdfDoc.save({ useObjectStreams: false });
  return finalBuffer;
}

module.exports = {
  cleanPdfBuffer,
  embedXmp,
  finalizePdf
};
