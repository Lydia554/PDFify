const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, PDFName, PDFHexString } = require("pdf-lib");
const generateZugferdXml = require("../../xml/generateZugferdXml");

async function finalizePdf(pdfDoc, invoiceData) {
    // 1. Setup ID for Trailer and XMP
    const id1 = crypto.randomBytes(16).toString('hex').toUpperCase();
    const id2 = crypto.randomBytes(16).toString('hex').toUpperCase();
    pdfDoc.context.trailerInfo.ID = pdfDoc.context.obj([PDFHexString.of(id1), PDFHexString.of(id2)]);

    // 2. Output Intent (ICC Profile)
    const iccProfilePath = path.join(__dirname, "sRGB2014.icc");
    const iccRef = pdfDoc.context.register(pdfDoc.context.stream(fs.readFileSync(iccProfilePath), { N: 3 }));
    pdfDoc.catalog.set(PDFName.of("OutputIntents"), pdfDoc.context.obj([{
        Type: PDFName.of("OutputIntent"), 
        S: PDFName.of("GTS_PDFA1"),
        OutputConditionIdentifier: PDFHexString.fromText("sRGB IEC61966-2.1"),
        Info: PDFHexString.fromText("sRGB IEC61966-2.1"), 
        DestOutputProfile: iccRef,
    }]));

    // 3. Attach ZUGFeRD XML
    const xmlString = generateZugferdXml(invoiceData);
    await pdfDoc.attach(Buffer.from(xmlString, "utf8"), 'factur-x.xml', {
        mimeType: "application/xml", 
        afRelationship: "Alternative",
    });

    // 4. Tagging Requirements
    pdfDoc.catalog.set(PDFName.of('MarkInfo'), pdfDoc.context.obj({ Marked: true }));
    const structTreeRef = pdfDoc.context.register(pdfDoc.context.obj({ Type: PDFName.of('StructTreeRoot') }));
    pdfDoc.catalog.set(PDFName.of('StructTreeRoot'), structTreeRef);

    // 5. INTERNAL METADATA INJECTION (The Fix)
    const xmpString = generatePdfA3bXmp(invoiceData, `uuid:${id1.toLowerCase()}`, `uuid:${id2.toLowerCase()}`);
    const xmpBytes = Buffer.from(xmpString, 'utf8');

    // Here we force-feed the Subtype to the stream dictionary
    const metadataStream = pdfDoc.context.stream(xmpBytes, {
        Type: PDFName.of('Metadata'),
        Subtype: PDFName.of('XML'),
    });
    const metadataRef = pdfDoc.context.register(metadataStream);
    pdfDoc.catalog.set(PDFName.of('Metadata'), metadataRef);

    // 6. Final Save with strict settings
    const pdfBytes = await pdfDoc.save({ 
        useObjectStreams: false, 
        addDefaultMetadata: false 
    });
    
    return Buffer.from(pdfBytes);
}

function generatePdfA3bXmp(invoiceData, documentId, instanceId) {
  const now = new Date().toISOString();
  // Ensure strict format YYYY-MM-DDThh:mm:ssZ
  const creationDate = now.substring(0, 19) + 'Z'; 
  const orderId = invoiceData.orderId || 'Unknown';

  const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 5.6-c140">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  
  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
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
</x:xmpmeta>
<?xpacket end="w"?>`;

  return xmp.trim();
}

module.exports = { finalizePdf };