const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, PDFName, PDFHexString } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const generateZugferdXml = require("../../xml/generateZugferdXml");
// Utility to generate UUIDs for xmpMM:DocumentID and InstanceID
function generateUuid() {
return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
return v.toString(16);
});
}
function cleanPdfBuffer(buf) {
const pdfStart = buf.indexOf('%PDF');
return pdfStart > 0 ? buf.slice(pdfStart) : buf;
}
function generatePdfA3bXmp(invoiceData) {
const now = new Date().toISOString();
const creationDate = now.substring(0, now.length - 5) + 'Z';
const orderId = invoiceData.orderId || 'UNKNOWN';
const zugferdFilename = `factur-x.xml`;
const documentId = `uuid:${generateUuid()}`;
const instanceId = `uuid:${generateUuid()}`;
return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about=""
xmlns:xmp="http://ns.adobe.com/xap/1.0/"
xmlns:dc="http://purl.org/dc/elements/1.1/"
xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/"
xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
<dc:format>application/pdf</dc:format>
<dc:title>
<rdf:Alt>
<rdf:li xml:lang="x-default">Invoice ${orderId}</rdf:li>
</rdf:Alt>
</dc:title>
<dc:creator>
<rdf:Seq>
<rdf:li>PDFify</rdf:li>
</rdf:Seq>
</dc:creator>
<dc:description>
<rdf:Alt>
<rdf:li xml:lang="x-default">Factur-X Invoice ${orderId}</rdf:li>
</rdf:Alt>
</dc:description>
<xmp:CreateDate>${creationDate}</xmp:CreateDate>
<xmp:ModifyDate>${creationDate}</xmp:ModifyDate>
<xmp:MetadataDate>${creationDate}</xmp:MetadataDate>
<xmp:CreatorTool>PDFify v1.0 (Puppeteer + pdf-lib)</xmp:CreatorTool>
<xmpMM:DocumentID>${documentId}</xmpMM:DocumentID>
<xmpMM:InstanceID>${instanceId}</xmpMM:InstanceID>
<pdfaid:part>3</pdfaid:part>
<pdfaid:conformance>B</pdfaid:conformance>
</rdf:Description>
<!-- PDF/A Extension Schema for Factur-X -->
<rdf:Description rdf:about=""
xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/"
xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#"
xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
<pdfaExtension:schemas>
<rdf:Bag>
<rdf:li rdf:parseType="Resource">
<pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
<pdfaSchema:namespaceURI>urn:factur-
x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
<pdfaSchema:prefix>fx</pdfaSchema:prefix>
<pdfaSchema:property>
<rdf:Seq>
<rdf:li rdf:parseType="Resource">
<pdfaProperty:name>DocumentFileName</pdfaProperty:name>
<pdfaProperty:valueType>Text</pdfaProperty:valueType>
<pdfaProperty:category>external</pdfaProperty:category>
<pdfaProperty:description>Name of the embedded XML invoice
file</pdfaProperty:description>
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
<pdfaProperty:description>The conformance level of the embedded Factur-X
data</pdfaProperty:description>
</rdf:li>
<rdf:li rdf:parseType="Resource">
<pdfaProperty:name>Version</pdfaProperty:name>
<pdfaProperty:valueType>Text</pdfaProperty:valueType>
<pdfaProperty:category>external</pdfaProperty:category>
<pdfaProperty:description>The version of the Factur-X
standard</pdfaProperty:description>
</rdf:li>
</rdf:Seq>
</pdfaSchema:property>
</rdf:li>
</rdf:Bag>
</pdfaExtension:schemas>
</rdf:Description>
<!-- Factur-X Metadata (Actual Values) -->
<rdf:Description rdf:about=""
xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
<fx:DocumentFileName>${zugferdFilename}</fx:DocumentFileName>
<fx:DocumentType>INVOICE</fx:DocumentType>
<fx:ConformanceLevel>COMFORT</fx:ConformanceLevel>
<fx:Version>1.0</fx:Version>
</rdf:Description>
</rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}
/**
* Embed ICC color profile for PDF/A-3b compliance
*/
async function embedIccProfile(pdfDoc) {
const iccProfilePath = path.join(__dirname, "sRGB2014.icc");
if (!fs.existsSync(iccProfilePath)) {
console.warn(" ICC profile not found, skipping OutputIntent" );
return;
}
const iccProfileBytes = fs.readFileSync(iccProfilePath);
const iccStream = pdfDoc.context.stream(iccProfileBytes, { N: 3 });
const iccRef = pdfDoc.context.register(iccStream);
const outputIntent = pdfDoc.context.obj({
Type: PDFName.of("OutputIntent"),
S: PDFName.of("GTS_PDFA1"),
OutputConditionIdentifier: PDFHexString.fromText("sRGB IEC61966-2.1"),
RegistryName: PDFHexString.fromText("http://www.color.org"),
Info: PDFHexString.fromText("sRGB IEC61966-2.1"),
DestOutputProfile: iccRef
});
pdfDoc.catalog.set(PDFName.of("OutputIntents"),
pdfDoc.context.obj([outputIntent]));
console.log(" ICC color profile embedded" );
}
async function embedZugferdXml(pdfDoc, invoiceData) {
console.log(" Embedding ZUGFeRD XML for order:" , invoiceData.orderId);
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
console.log(" ZUGFeRD XML embedded successfully" );
}
// -----------------------------
// Finalize PDF: Full PDF/A-3b Implementation
// -----------------------------
async function finalizePdf(originalPdfBuffer, invoiceData) {
console.log(" Using FULL finalizePdf function (v11 - Page-copying with manual ID and metadata fix)" );
// 1. Load the source PDF from Puppeteer
const sourcePdfDoc = await PDFDocument.load(cleanPdfBuffer(originalPdfBuffer));
// 2. Create a new PDF document
const pdfDoc = await PDFDocument.create();
pdfDoc.registerFontkit(fontkit);
// 3. Copy pages from the source to the new document
const copiedPageIndices = await pdfDoc.copyPages(sourcePdfDoc,
sourcePdfDoc.getPageIndices());
copiedPageIndices.forEach((page) => pdfDoc.addPage(page));
console.log(` Copied ${copiedPageIndices.length} pages to new PDF document.`);
// 4. Embed ICC profile
await embedIccProfile(pdfDoc);
// 5. Add XMP metadata
const xmp = generatePdfA3bXmp(invoiceData);
const metadataStream = pdfDoc.context.stream(xmp, {
  Type: 'Metadata',
  Subtype: 'XML',
  Length: xmp.length,
});
const metadataRef = pdfDoc.context.register(metadataStream);
pdfDoc.catalog.set(PDFName.of('Metadata'), metadataRef);
console.log(" XMP metadata embedded successfully" );
// 6. Embed ZUGFeRD XML
await embedZugferdXml(pdfDoc, invoiceData);
// 7. Mark as tagged PDF (important for accessibility and PDF/A)
pdfDoc.catalog.set(PDFName.of('MarkInfo'), pdfDoc.context.obj({ Marked: true }));
console.log(" PDF marked as tagged" );
// 8. Set PDF Info Dictionary (Producer, Creator, Dates)
pdfDoc.setProducer('PDFify with pdf-lib');
pdfDoc.setCreator('PDFify Application');
pdfDoc.setCreationDate(new Date());
pdfDoc.setModificationDate(new Date());

// 9. Manually create and set the PDF /ID entry in the trailer.
const uniqueId = crypto.randomBytes(16).toString('hex').toUpperCase();
const idArray = pdfDoc.context.obj([
  PDFHexString.of(uniqueId),
  PDFHexString.of(uniqueId),
]);
pdfDoc.context.trailer.set(PDFName.of('ID'), idArray);
console.log(` Manually set PDF trailer ID: ${uniqueId}`);

// 10. Save the document
const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
console.log(" PDF finalization complete with page-copying strategy." );
return Buffer.from(pdfBytes);
}

module.exports = {
generatePdfA3bXmp,
embedZugferdXml,
finalizePdf,
};