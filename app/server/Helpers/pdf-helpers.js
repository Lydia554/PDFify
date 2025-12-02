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
// Generate PDF/A-3b XMP Metadata
// -----------------------------
function generatePdfA3bXmp(invoiceData) {
  const now = new Date().toISOString();
  const orderId = invoiceData.orderId || 'UNKNOWN';

  return `<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?>
<x:xmpmeta xmlns:x='adobe:ns:meta/'>
  <rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>
    <!-- Dublin Core Metadata -->
    <rdf:Description rdf:about=''
        xmlns:dc='http://purl.org/dc/elements/1.1/'>
      <dc:format>application/pdf</dc:format>
      <dc:title>
        <rdf:Alt>
          <rdf:li xml:lang='x-default'>Invoice ${orderId}</rdf:li>
        </rdf:Alt>
      </dc:title>
      <dc:creator>
        <rdf:Seq>
          <rdf:li>PDFify Invoice Generator</rdf:li>
        </rdf:Seq>
      </dc:creator>
      <dc:description>
        <rdf:Alt>
          <rdf:li xml:lang='x-default'>ZUGFeRD Invoice ${orderId}</rdf:li>
        </rdf:Alt>
      </dc:description>
    </rdf:Description>

    <!-- PDF/A Identification -->
    <rdf:Description rdf:about=''
        xmlns:pdfaid='http://www.aiim.org/pdfa/ns/id/'>
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>

    <!-- XMP Basic Metadata -->
    <rdf:Description rdf:about=''
        xmlns:xmp='http://ns.adobe.com/xap/1.0/'>
      <xmp:CreatorTool>PDFify v1.0 (Puppeteer + pdf-lib)</xmp:CreatorTool>
      <xmp:CreateDate>${now}</xmp:CreateDate>
      <xmp:ModifyDate>${now}</xmp:ModifyDate>
      <xmp:MetadataDate>${now}</xmp:MetadataDate>
    </rdf:Description>

    <!-- PDF Extension Schema for ZUGFeRD -->
    <rdf:Description rdf:about=''
        xmlns:pdfaExtension='http://www.aiim.org/pdfa/ns/extension/'
        xmlns:pdfaSchema='http://www.aiim.org/pdfa/ns/schema#'
        xmlns:pdfaProperty='http://www.aiim.org/pdfa/ns/property#'>
      <pdfaExtension:schemas>
        <rdf:Bag>
          <rdf:li rdf:parseType='Resource'>
            <pdfaSchema:schema>ZUGFeRD PDFA Extension Schema</pdfaSchema:schema>
            <pdfaSchema:namespaceURI>urn:ferd:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
            <pdfaSchema:prefix>zf</pdfaSchema:prefix>
            <pdfaSchema:property>
              <rdf:Seq>
                <rdf:li rdf:parseType='Resource'>
                  <pdfaProperty:name>DocumentFileName</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>Name of the embedded ZUGFeRD invoice XML file</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType='Resource'>
                  <pdfaProperty:name>DocumentType</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>Type of the embedded ZUGFeRD data</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType='Resource'>
                  <pdfaProperty:name>ConformanceLevel</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>ZUGFeRD conformance level</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType='Resource'>
                  <pdfaProperty:name>Version</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>ZUGFeRD version</pdfaProperty:description>
                </rdf:li>
              </rdf:Seq>
            </pdfaSchema:property>
          </rdf:li>
        </rdf:Bag>
      </pdfaExtension:schemas>
    </rdf:Description>

    <!-- ZUGFeRD Metadata -->
    <rdf:Description rdf:about=''
        xmlns:zf='urn:ferd:pdfa:CrossIndustryDocument:invoice:1p0#'>
      <zf:DocumentFileName>ZUGFeRD-invoice-${orderId}.xml</zf:DocumentFileName>
      <zf:DocumentType>INVOICE</zf:DocumentType>
      <zf:ConformanceLevel>BASIC</zf:ConformanceLevel>
      <zf:Version>1.0</zf:Version>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end='w'?>`;
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
        console.warn("⚠️ EmbeddedFiles.Names array not found, cannot append");
      }
    } else {
      console.warn("⚠️ EmbeddedFiles dictionary not found, cannot append");
    }
  }

  const afArray = pdfDoc.context.obj([fileSpecRef]);
  pdfDoc.catalog.set(PDFName.of("AF"), afArray);

  console.log("✅ ZUGFeRD XML embedded successfully");
  return pdfDoc;
}

// -----------------------------
// Finalize PDF: Add ZUGFeRD XML ONLY
// -----------------------------
async function finalizePdf(originalPdfBuffer, invoiceData) {
  console.log("📄 Using MINIMAL finalizePdf function (v5 - XML Only) ✨📄");
  const cleanBuffer = cleanPdfBuffer(originalPdfBuffer);
  const pdfDoc = await PDFDocument.load(cleanBuffer);

  // Embed ZUGFeRD XML as file object, referenced via AF array
  await embedZugferdXml(pdfDoc, invoiceData);

  return Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
}


module.exports = {
  cleanPdfBuffer,
  embedZugferdXml,
  finalizePdf,
  generatePdfA3bXmp
};
