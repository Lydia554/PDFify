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
    F: PDFHexString.fromText(`factur-x.xml`),
    UF: PDFHexString.fromText(`factur-x.xml`),
    EF: pdfDoc.context.obj({ F: xmlRef }),
    AFRelationship: PDFName.of("Alternative"),
  });
  const fileSpecRef = pdfDoc.context.register(fileSpec);

  let names = pdfDoc.catalog.lookupMaybe(PDFName.of("Names"));
  if (!names) {
    console.log("📁 Names dictionary not found, creating new one");
    names = pdfDoc.context.obj({
      EmbeddedFiles: pdfDoc.context.obj({
        Names: [PDFHexString.fromText(`factur-x.xml`), fileSpecRef],
      }),
    });
    pdfDoc.catalog.set(PDFName.of("Names"), names);
  } else {
    console.log("📁 Names dictionary exists, appending");
    const embeddedFiles = names.lookupMaybe(PDFName.of("EmbeddedFiles"));
    if (embeddedFiles) {
      const namesArray = embeddedFiles.lookup(PDFName.of("Names"));
      if (namesArray) {
        namesArray.push(PDFHexString.fromText(`factur-x.xml`), fileSpecRef);
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
  const now = new Date();
  const creator = invoiceData.creator || "PDFify";
  const producer = "pdf-lib";

  // Set metadata in Info dictionary to sync with XMP
  pdfDoc.setTitle(invoiceData.orderId);
  pdfDoc.setCreator(creator);
  pdfDoc.setProducer(producer);
  pdfDoc.setCreationDate(now);
  pdfDoc.setModificationDate(now);

  // Create and embed compliant XMP
  const xmp = `<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?>
<x:xmpmeta xmlns:x='adobe:ns:meta/'>
  <rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>
    <rdf:Description rdf:about=''
        xmlns:pdfaid='http://www.aiim.org/pdfa/ns/id/'
        xmlns:dc='http://purl.org/dc/elements/1.1/'
        xmlns:xmp='http://ns.adobe.com/xap/1.0/'
        xmlns:pdf='http://ns.adobe.com/pdf/1.3/'>
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
      <dc:title>
        <rdf:Alt>
          <rdf:li xml:lang="x-default">${invoiceData.orderId}</rdf:li>
        </rdf:Alt>
      </dc:title>
      <dc:creator>
        <rdf:Seq>
          <rdf:li>${creator}</rdf:li>
        </rdf:Seq>
      </dc:creator>
      <xmp:CreatorTool>${creator}</xmp:CreatorTool>
      <xmp:CreateDate>${now.toISOString()}</xmp:CreateDate>
      <xmp:ModifyDate>${now.toISOString()}</xmp:ModifyDate>
      <pdf:Producer>${producer}</pdf:Producer>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end='w'?>`;

  const metadataStream = pdfDoc.context.stream(Buffer.from(xmp, 'utf8'), {
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


