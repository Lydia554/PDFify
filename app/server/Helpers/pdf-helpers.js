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
  const cleanBuffer = cleanPdfBuffer(originalPdfBuffer);
  const pdfDoc = await PDFDocument.load(cleanBuffer);

  // Only embed PDF/A-3B identification XMP
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

  const metadataStream = pdfDoc.context.flateStream(Buffer.from(xmp, 'utf8'), {
    Type: PDFName.of('Metadata'),
    Subtype: PDFName.of('XML'),
  });

  const metadataRef = pdfDoc.context.register(metadataStream);
  pdfDoc.catalog.set(PDFName.of('Metadata'), metadataRef);
  pdfDoc.catalog.set(PDFName.of('MarkInfo'), pdfDoc.context.obj({ Marked: true }));

  // Embed ZUGFeRD XML as file object, referenced via AF array
  await embedZugferdXml(pdfDoc, invoiceData);

  return Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
}


module.exports = {
  cleanPdfBuffer,
  embedZugferdXml,
  finalizePdf,
};
