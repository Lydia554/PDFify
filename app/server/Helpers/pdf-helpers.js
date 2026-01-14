const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, PDFName, PDFHexString, PDFString } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const generateZugferdXml = require("../../xml/generateZugferdXml");

/**
 * Generates the raw XMP metadata string for PDF/A-3b compliance.
 * Uses strict RDF structure with separate Description blocks for better validator compatibility.
 */
function generatePdfA3bXmp(invoiceData, documentId, instanceId) {
  const now = new Date().toISOString();
  // Ensure strict format YYYY-MM-DDThh:mm:ssZ
  const creationDate = now.substring(0, 19) + 'Z'; 
  const orderId = invoiceData.orderId || 'Unknown';
  
  // Padding for XMP (approx 2KB of whitespace)
  const padding = " ".repeat(2000);

  const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 5.6-c140">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
  
  <rdf:Description rdf:about="">
   <pdfaid:part>3</pdfaid:part>
   <pdfaid:conformance>B</pdfaid:conformance>
  </rdf:Description>

  <rdf:Description rdf:about="" 
      xmlns:dc="http://purl.org/dc/elements/1.1/" 
      xmlns:xmp="http://ns.adobe.com/xap/1.0/" 
      xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/">
   <dc:format>application/pdf</dc:format>
   <dc:title>
    <rdf:Alt>
     <rdf:li xml:lang="x-default">Invoice ${orderId}</rdf:li>
    </rdf:Alt>
   </dc:title>
   <xmp:CreateDate>${creationDate}</xmp:CreateDate>
   <xmp:ModifyDate>${creationDate}</xmp:ModifyDate>
   <xmpMM:DocumentID>${documentId}</xmpMM:DocumentID>
   <xmpMM:InstanceID>${instanceId}</xmpMM:InstanceID>
  </rdf:Description>

  <rdf:Description rdf:about="" xmlns:af="http://ns.adobe.com/xap/1.0/af/">
    <af:relationships>
      <rdf:Bag>
        <rdf:li rdf:parseType="Resource">
          <af:AFRelationship>Alternative</af:AFRelationship>
          <rdf:resource>factur-x.xml</rdf:resource>
        </rdf:li>
      </rdf:Bag>
    </af:relationships>
  </rdf:Description>

  <rdf:Description rdf:about="" 
      xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#" 
      xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" 
      xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" 
      xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
   <fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>
   <fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>
   <fx:DocumentType>INVOICE</fx:DocumentType>
   <fx:Version>1.0</fx:Version>
   
   <pdfaExtension:schemas>
    <rdf:Bag>
     <rdf:li rdf:parseType="Resource">
      <pdfaSchema:schema>Factur-X PDF/A Extension Schema</pdfaSchema:schema>
      <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
      <pdfaSchema:prefix>fx</pdfaSchema:prefix>
      <pdfaSchema:property>
       <rdf:Seq>
        <rdf:li rdf:parseType="Resource">
         <pdfaProperty:name>ConformanceLevel</pdfaProperty:name>
         <pdfaProperty:valueType>Text</pdfaProperty:valueType>
         <pdfaProperty:category>external</pdfaProperty:category>
         <pdfaProperty:description>The conformance level of the embedded Factur-X XML.</pdfaProperty:description>
        </rdf:li>
        <rdf:li rdf:parseType="Resource">
         <pdfaProperty:name>DocumentFileName</pdfaProperty:name>
         <pdfaProperty:valueType>Text</pdfaProperty:valueType>
         <pdfaProperty:category>external</pdfaProperty:category>
         <pdfaProperty:description>The name of the embedded XML document.</pdfaProperty:description>
        </rdf:li>
        <rdf:li rdf:parseType="Resource">
         <pdfaProperty:name>DocumentType</pdfaProperty:name>
         <pdfaProperty:valueType>Text</pdfaProperty:valueType>
         <pdfaProperty:category>external</pdfaProperty:category>
         <pdfaProperty:description>The type of the hybrid document.</pdfaProperty:description>
        </rdf:li>
        <rdf:li rdf:parseType="Resource">
         <pdfaProperty:name>Version</pdfaProperty:name>
         <pdfaProperty:valueType>Text</pdfaProperty:valueType>
         <pdfaProperty:category>external</pdfaProperty:category>
         <pdfaProperty:description>The version of the Factur-X standard.</pdfaProperty:description>
        </rdf:li>
       </rdf:Seq>
      </pdfaSchema:property>
     </rdf:li>
    </rdf:Bag>
   </pdfaExtension:schemas>
  </rdf:Description>

 </rdf:RDF>
${padding}
</x:xmpmeta>
<?xpacket end="w"?>`;

  return xmp.trim(); // Still trim the start/end, but padding is inside
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
    console.log("✨ finalizePdf function called.");
    console.log(" Finalizing PDF document for PDF/A-3b compliance (v14 - Manual Info Dict)");

    // 1. Manually Set Info Dictionary
    // We avoid using pdfDoc.setProducer/setCreator/etc. because they might
    // trigger an internal "dirty" flag that causes pdf-lib to re-generate (and overwrite)
    // our custom XMP metadata during save().
    const now = new Date();
    const infoDict = pdfDoc.context.obj({
        Producer: 'PDFify',
        Creator: 'PDFify',
        CreationDate: PDFString.fromDate(now),
        ModDate: PDFString.fromDate(now),
    });
    // Overwrite the existing Info reference or create a new one
    pdfDoc.context.trailerInfo.Info = pdfDoc.context.register(infoDict);
    console.log(" Info dictionary set manually (bypassing auto-XMP trigger)");

    // 2. Embed ICC Profile & OutputIntents
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

    // 3. Generate IDs for Trailer and XMP
    const pdfTrailerId1 = crypto.randomBytes(16).toString('hex').toUpperCase();
    const pdfTrailerId2 = crypto.randomBytes(16).toString('hex').toUpperCase();
    pdfDoc.context.trailerInfo.ID = pdfDoc.context.obj([PDFHexString.of(pdfTrailerId1), PDFHexString.of(pdfTrailerId2)]);

    const xmpDocumentId = `uuid:${pdfTrailerId1.toLowerCase()}`;
    const xmpInstanceId = `uuid:${pdfTrailerId2.toLowerCase()}`;
    invoiceData.documentId = xmpDocumentId;
    invoiceData.instanceId = xmpInstanceId;

    // 4. Attach ZUGFeRD XML
    await embedZugferdXml(pdfDoc, invoiceData);

    // 5. Mark as Tagged & Add StructTreeRoot (Required for PDF/A-3b)
    const structTreeRoot = pdfDoc.context.obj({
      Type: PDFName.of('StructTreeRoot'),
    });
    const structTreeRootRef = pdfDoc.context.register(structTreeRoot);
    pdfDoc.catalog.set(PDFName.of('StructTreeRoot'), structTreeRootRef);
    pdfDoc.catalog.set(PDFName.of('MarkInfo'), pdfDoc.context.obj({ Marked: true }));

    // 6. LAST STEP: Inject custom XMP Metadata stream
    const xmpString = generatePdfA3bXmp(invoiceData, xmpDocumentId, xmpInstanceId);
    const xmpBytes = new TextEncoder().encode(xmpString);

    const metadataStream = pdfDoc.context.stream(xmpBytes, {
      Type: PDFName.of('Metadata'),
      Subtype: PDFName.of('XML'),
    });
    const metadataRef = pdfDoc.context.register(metadataStream);
    pdfDoc.catalog.set(PDFName.of('Metadata'), metadataRef);
    console.log(" XMP metadata injected as the final structural step");

    const pdfBytes = await pdfDoc.save({ 
      useObjectStreams: false,
      addDefaultMetadata: false 
    });
    console.log(" PDF finalization complete.");
    return Buffer.from(pdfBytes);
}

module.exports = {
  finalizePdf,
  generatePdfA3bXmp,
};