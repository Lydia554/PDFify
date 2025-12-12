const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, PDFName, PDFHexString } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const generateZugferdXml = require("../../xml/generateZugferdXml");

function generateUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function generatePdfA3bXmp(invoiceData, documentId, instanceId) {
  const now = new Date().toISOString();
  const creationDate = now.substring(0, now.length - 5) + 'Z';
  const orderId = invoiceData.orderId || 'UNKNOWN';
  const zugferdFilename = `factur-x.xml`;

  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:xmp="http://ns.adobe.com/xap/1.0/"
        xmlns:dc="http://purl.org/dc/elements/1.1/"
        xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/"
        xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <dc:format>application/pdf</dc:format>
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">Invoice ${orderId}</rdf:li></rdf:Alt></dc:title>
      <dc:creator><rdf:Seq><rdf:li>PDFify</rdf:li></rdf:Seq></dc:creator>
      <dc:description><rdf:Alt><rdf:li xml:lang="x-default">Factur-X Invoice ${orderId}</rdf:li></rdf:Alt></dc:description>
      <xmp:CreateDate>${creationDate}</xmp:CreateDate>
      <xmp:ModifyDate>${creationDate}</xmp:ModifyDate>
      <xmp:MetadataDate>${creationDate}</xmp:MetadataDate>
      <xmp:CreatorTool>PDFify v1.1 (pdf-lib)</xmp:CreatorTool>
      <xmpMM:DocumentID>${documentId}</xmpMM:DocumentID>
      <xmpMM:InstanceID>${instanceId}</xmpMM:InstanceID>
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
    <rdf:Description rdf:about=""
        xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/"
        xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#"
        xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
      <pdfaExtension:schemas>
        <rdf:Bag>
          <rdf:li rdf:parseType="Resource">
            <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
            <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
            <pdfaSchema:prefix>fx</pdfaSchema:prefix>
            <pdfaSchema:property>
              <rdf:Seq>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>DocumentFileName</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>Name of the embedded XML invoice file</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>DocumentType</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>INVOICE</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>ConformanceLevel</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>The conformance level of the embedded Factur-X data</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>Version</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>The version of the Factur-X standard</pdfaProperty:description>
                </rdf:li>
              </rdf:Seq>
            </pdfaSchema:property>
          </rdf:li>
        </rdf:Bag>
      </pdfaExtension:schemas>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
      <fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>
      <fx:DocumentType>INVOICE</fx:DocumentType>
      <fx:ConformanceLevel>COMFORT</fx:ConformanceLevel>
      <fx:Version>1.0</fx:Version>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

async function embedZugferdXml(pdfDoc, invoiceData) {
  console.log(" Embedding ZUGFeRD XML for order:", invoiceData.orderId);
  const xmlString = generateZugferdXml(invoiceData);
  const zugferdFilename = `factur-x.xml`;
  const xmlBytes = Buffer.from(xmlString, "utf8");
  await pdfDoc.attach(xmlBytes, zugferdFilename, {
    mimeType: "application/xml",
    afRelationship: "Alternative",
    creationDate: new Date(),
    modificationDate: new Date(),
    description: "Factur-X (ZUGFeRD) Invoice",
  });
  console.log(" ZUGFeRD XML embedded successfully");
}

async function finalizePdf(pdfDoc, invoiceData) {
    console.log(" Finalizing PDF document for PDF/A-3b compliance (v18 - Pass 1)");

    const iccProfilePath = path.join(__dirname, "sRGB2014.icc");
    const iccProfileBytes = fs.readFileSync(iccProfilePath);
    const iccStream = pdfDoc.context.stream(iccProfileBytes, { N: 3 });
    const iccRef = pdfDoc.context.register(iccStream);
    const outputIntent = pdfDoc.context.obj({
        Type: PDFName.of("OutputIntent"),
        S: PDFName.of("GTS_PDFA1"),
        OutputConditionIdentifier: PDFHexString.fromText("sRGB IEC61966-2.1"),
        RegistryName: PDFHexString.fromText("http://www.color.org"),
        Info: PDFHexString.fromText("sRGB IEC61966-2.1"),
        DestOutputProfile: iccRef,
    });
    pdfDoc.catalog.set(PDFName.of("OutputIntents"), pdfDoc.context.obj([outputIntent]));
    console.log(" ICC profile embedded successfully");

    const documentId = `uuid:${generateUuid()}`;
    const instanceId = `uuid:${generateUuid()}`;
    
    const xmp = generatePdfA3bXmp(invoiceData, documentId, instanceId);
    
    const metadataStream = pdfDoc.context.stream(xmp, {
        Type: PDFName.of('Metadata'),
        Subtype: PDFName.of('XML'),
        Length: xmp.length,
    });

    const metadataRef = pdfDoc.context.register(metadataStream);
    pdfDoc.catalog.set(PDFName.of('Metadata'), metadataRef);
    console.log(" XMP metadata embedded successfully");

    await embedZugferdXml(pdfDoc, invoiceData);

    pdfDoc.catalog.set(PDFName.of('MarkInfo'), pdfDoc.context.obj({ Marked: true }));
    console.log(" PDF marked as tagged");

    pdfDoc.setProducer('PDFify with pdf-lib');
    pdfDoc.setCreator('PDFify Application');
    pdfDoc.setCreationDate(new Date());
    pdfDoc.setModificationDate(new Date());

    const id = PDFHexString.of(crypto.randomBytes(16).toString('hex'));
    pdfDoc.context.trailerInfo.ID = pdfDoc.context.obj([id, id]);

    const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
    console.log(" PDF finalization complete.");
    return Buffer.from(pdfBytes);
}

async function finalizePdf_Pass2(pdfBuffer, invoiceData) {
    console.log(" Finalizing PDF document for PDF/A-3b compliance (v19 - Pass 2)");

    const pdfDoc = await PDFDocument.load(pdfBuffer);
    pdfDoc.registerFontkit(fontkit);

    const iccProfilePath = path.join(__dirname, "sRGB2014.icc");
    const iccProfileBytes = fs.readFileSync(iccProfilePath);
    const iccStream = pdfDoc.context.stream(iccProfileBytes, { N: 3 });
    const iccRef = pdfDoc.context.register(iccStream);
    const outputIntent = pdfDoc.context.obj({
        Type: PDFName.of("OutputIntent"),
        S: PDFName.of("GTS_PDFA1"),
        OutputConditionIdentifier: PDFHexString.fromText("sRGB IEC61966-2.1"),
        RegistryName: PDFHexString.fromText("http://www.color.org"),
        Info: PDFHexString.fromText("sRGB IEC61966-2.1"),
        DestOutputProfile: iccRef,
    });
    pdfDoc.catalog.set(PDFName.of("OutputIntents"), pdfDoc.context.obj([outputIntent]));
    console.log(" ICC profile embedded successfully");

    const documentId = `uuid:${generateUuid()}`;
    const instanceId = `uuid:${generateUuid()}`;
    
    const xmp = generatePdfA3bXmp(invoiceData, documentId, instanceId);
    
    const metadataStream = pdfDoc.context.stream(xmp, {
        Type: 'Metadata',
        Subtype: 'XML',
        Length: xmp.length,
    });

    const metadataRef = pdfDoc.context.register(metadataStream);
    pdfDoc.catalog.set(PDFName.of('Metadata'), metadataRef);
    console.log(" XMP metadata embedded successfully");

    await embedZugferdXml(pdfDoc, invoiceData);

    pdfDoc.catalog.set(PDFName.of('MarkInfo'), pdfDoc.context.obj({ Marked: true }));
    console.log(" PDF marked as tagged");

    pdfDoc.setProducer('PDFify with pdf-lib');
    pdfDoc.setCreator('PDFify Application');
    pdfDoc.setCreationDate(new Date());
    pdfDoc.setModificationDate(new Date());

    const id = PDFHexString.of(crypto.randomBytes(16).toString('hex'));
    pdfDoc.context.trailerInfo.ID = pdfDoc.context.obj([id, id]);

    const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
    console.log(" PDF finalization complete.");
    return Buffer.from(pdfBytes);
}


module.exports = {
  finalizePdf,
  finalizePdf_Pass2,
};