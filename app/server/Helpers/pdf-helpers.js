const fs = require("fs");
const path = require("path");
const { PDFDocument, PDFName, PDFHexString } = require("pdf-lib");
const generateZugferdXml = require("../../xml/generateZugferdXml");

// -----------------------------
// Helper: Clean PDF buffer
// -----------------------------
function cleanPdfBuffer(buf) {
  const pdfStart = buf.indexOf(Buffer.from("%PDF-"));
  console.log("🧹 Cleaning PDF buffer, start at:", pdfStart);
  return pdfStart > 0 ? buf.slice(pdfStart) : buf;
}

// -----------------------------
// Embed XMP metadata into PDF
// -----------------------------
async function embedXmp(pdfDoc) {
  console.log("🟢 Embedding XMP metadata");
  const xmp = `<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?>
<x:xmpmeta xmlns:x='adobe:ns:meta/'>
  <rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>
    <rdf:Description rdf:about=''
        xmlns:pdfaid='http://www.aiim.org/pdfa/ns/id/'>
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end='w'?>`;

  const metadataStream = pdfDoc.context.stream(Buffer.from(xmp, "utf8"), {
    Type: PDFName.of("Metadata"),
    Subtype: PDFName.of("XML"),
  });

  const metadataRef = pdfDoc.context.register(metadataStream);

  if (!pdfDoc.catalog) throw new Error("❌ pdfDoc.catalog is undefined while embedding XMP!");
  pdfDoc.catalog.set(PDFName.of("Metadata"), metadataRef);
  pdfDoc.catalog.set(PDFName.of("MarkInfo"), pdfDoc.context.obj({ Marked: true }));

  console.log("✅ XMP metadata embedded successfully");
  return pdfDoc;
}

// -----------------------------
// Embed ZUGFeRD XML into PDF
// -----------------------------
async function embedZugferdXml(pdfDoc, invoiceData) {
  console.log("🟢 Embedding ZUGFeRD XML for order:", invoiceData.orderId);
  const xmlString = generateZugferdXml(invoiceData);

  const xmlStream = pdfDoc.context.flateStream(Buffer.from(xmlString, "utf8"), {
    Type: PDFName.of("EmbeddedFile"),
    Subtype: PDFName.of("text#2Fxml"),
    Params: pdfDoc.context.obj({
      ModDate: new Date().toISOString(),
    }),
  });
  const xmlRef = pdfDoc.context.register(xmlStream);

  const fileSpec = pdfDoc.context.obj({
    Type: PDFName.of("Filespec"),
    F: PDFHexString.fromText(`ZUGFeRD-invoice-${invoiceData.orderId}.xml`),
    UF: PDFHexString.fromText(`ZUGFeRD-invoice-${invoiceData.orderId}.xml`),
    EF: pdfDoc.context.obj({ F: xmlRef }),
    AFRelationship: PDFName.of("Alternative"),
  });
  const fileSpecRef = pdfDoc.context.register(fileSpec);

  let names = pdfDoc.catalog.lookupMaybe(PDFName.of("Names"));
  if (!names) {
    console.log("📁 Names dictionary not found, creating new one");
    names = pdfDoc.context.obj({
      EmbeddedFiles: pdfDoc.context.obj({
        Names: [PDFHexString.fromText(`ZUGFeRD-invoice-${invoiceData.orderId}.xml`), fileSpecRef],
      }),
    });
    pdfDoc.catalog.set(PDFName.of("Names"), names);
  } else {
    console.log("📁 Names dictionary exists, appending");
    const embeddedFiles = names.lookupMaybe(PDFName.of("EmbeddedFiles"));
    if (embeddedFiles) {
      const namesArray = embeddedFiles.lookup(PDFName.of("Names"));
      if (namesArray) {
        namesArray.push(PDFHexString.fromText(`ZUGFeRD-invoice-${invoiceData.orderId}.xml`), fileSpecRef);
      } else {
        console.warn("⚠️ EmbeddedFiles.Names not found, cannot append");
      }
    }
  }

  const afArray = pdfDoc.context.obj([fileSpecRef]);
  pdfDoc.catalog.set(PDFName.of("AF"), afArray);

  console.log("✅ ZUGFeRD XML embedded successfully");
  return pdfDoc;
}

// -----------------------------
// Finalize PDF: Add XMP + ZUGFeRD XML
// -----------------------------
async function finalizePdf(originalPdfBuffer, invoiceData) {
  console.log("🟢 finalizePdf start for order:", invoiceData.orderId);
  const cleanBuffer = cleanPdfBuffer(originalPdfBuffer);
  const pdfDoc = await PDFDocument.load(cleanBuffer);

  console.log("📄 PDF loaded, pages:", pdfDoc.getPages().length);

  await embedXmp(pdfDoc);
  await embedZugferdXml(pdfDoc, invoiceData);

  const finalBuffer = await pdfDoc.save({ useObjectStreams: false });
  console.log("💾 finalizePdf finished, buffer size:", finalBuffer.length);

  return finalBuffer;
}

module.exports = {
  cleanPdfBuffer,
  embedXmp,
  embedZugferdXml,
  finalizePdf,
};
