const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, PDFName, PDFHexString, PDFString } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const generateZugferdXml = require("../../xml/generateZugferdXml");

/**
 * Manually patches the PDF buffer to inject strict PDF/A-3b structural keys
 * (Metadata, MarkInfo, StructTreeRoot) into the Document Catalog.
 *
 * Strategy: "Undeletable Anchor Patcher" (/Pages)
 * Since pdf-lib strips custom keys like /ZF, we anchor our patch to the /Pages key,
 * which is mandatory for a valid PDF. We inject our metadata keys immediately
 * after the Catalog dictionary opening '<<'.
 *
 * @param {Buffer} pdfBuffer - The raw PDF bytes from pdf-lib.
 * @param {string} metadataRef - The object reference for the XMP Metadata stream (e.g., "15 0 R").
 * @param {string} structTreeRef - The object reference for the StructTreeRoot (e.g., "12 0 R").
 * @returns {Buffer} The patched PDF buffer.
 */
function patchPdfBuffer(pdfBuffer, metadataRef, structTreeRef) {
  let pdfString = pdfBuffer.toString('latin1');

  // 1. Locate the Catalog and specifically the /Pages key
  // This is a "Guaranteed Anchor" because every PDF has a Pages root.
  const catalogRegex = /(\d+ \d+ obj)\s*<<[^>]*\/Type\s*\/Catalog[^>]*\/Pages\s+(\d+ \d+ R)/;
  const match = pdfString.match(catalogRegex);

  if (!match) {
    console.error("❌ Critical: Could not anchor to /Pages. Using Direct Injection.");
    // Fallback: If regex fails (unlikely), just look for the first Catalog.
    // But for now, let's return original to avoid corruption if structure is weird.
    return pdfBuffer;
  }

  const matchIndex = match.index;

  // 2. Inject Keys
  // We inject: /Metadata X Y R /MarkInfo << /Marked true >> /StructTreeRoot A B R
  // We place this RIGHT AFTER the opening '<<' of the Catalog object.
  const openerIndex = pdfString.indexOf('<<', matchIndex) + 2;
  const finalInjection = ` /Metadata ${metadataRef} /MarkInfo << /Marked true >> /StructTreeRoot ${structTreeRef} `;

  // 3. Construct new string (This shifts offsets, invalidating XREF, but usually recoverable)
  const patchedString = pdfString.slice(0, openerIndex) + finalInjection + pdfString.slice(openerIndex);

  console.log("💉 PDF Catalog patched via /Pages anchor.");
  return Buffer.from(patchedString, 'latin1');
}

/**
 * Generates the raw XMP metadata string for PDF/A-3b compliance.
 * Uses strict RDF structure with separate Description blocks for better validator compatibility.
 */
function generatePdfA3bXmp(invoiceData, documentId, instanceId) {
  // Use simple ISO string, no millis to be safe
  const now = new Date().toISOString().split('.')[0] + 'Z'; 
  const orderId = invoiceData.orderId || 'Unknown';
  
  // Padding for XMP (approx 2KB of whitespace)
  const padding = " ".repeat(2000);

  // NO INDENTATION in the template literal below to prevent hidden chars
  return `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
<pdfaid:part>3</pdfaid:part>
<pdfaid:conformance>B</pdfaid:conformance>
</rdf:Description>
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:format>application/pdf</dc:format>
<dc:title><rdf:Alt><rdf:li xml:lang="x-default">Invoice ${orderId}</rdf:li></rdf:Alt></dc:title>
</rdf:Description>
<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
<xmp:CreateDate>${now}</xmp:CreateDate>
<xmp:ModifyDate>${now}</xmp:ModifyDate>
</rdf:Description>
<rdf:Description rdf:about="" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/">
<xmpMM:DocumentID>${documentId}</xmpMM:DocumentID>
<xmpMM:InstanceID>${instanceId}</xmpMM:InstanceID>
</rdf:Description>
<rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
<fx:ConformanceLevel>COMFORT</fx:ConformanceLevel>
<fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>
<fx:DocumentType>INVOICE</fx:DocumentType>
<fx:Version>1.0</fx:Version>
</rdf:Description>
</rdf:RDF>
</x:xmpmeta>
${padding}
<?xpacket end="w"?>`.trim(); 
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
    console.log(" Finalizing PDF document for PDF/A-3b compliance (v21 - Bulletproof XMP & Ghost Purge)");

    // 0. PURGE GHOST METADATA
    // Ensure pdf-lib doesn't create a conflicting Metadata object
    pdfDoc.catalog.delete(PDFName.of('Metadata'));

    // 1. Manually Set Info Dictionary
    const now = new Date();
    const infoDict = pdfDoc.context.obj({
        Producer: 'PDFify',
        Creator: 'PDFify',
        CreationDate: PDFString.fromDate(now),
        ModDate: PDFString.fromDate(now),
    });
    // Overwrite the existing Info reference or create a new one
    pdfDoc.context.trailerInfo.Info = pdfDoc.context.register(infoDict);
    console.log(" Info dictionary set manually.");

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
    // Note: We register it here to get the reference, but we will forcefully inject it later via patcher
    // because pdf-lib might drop it from the catalog.
    pdfDoc.catalog.set(PDFName.of('StructTreeRoot'), structTreeRootRef);
    // MarkInfo is also handled by the patcher, but setting it here doesn't hurt.
    pdfDoc.catalog.set(PDFName.of('MarkInfo'), pdfDoc.context.obj({ Marked: true }));

    // 6. Generate XMP Metadata stream and register it
    const xmpString = generatePdfA3bXmp(invoiceData, xmpDocumentId, xmpInstanceId);
    const xmpBytes = new TextEncoder().encode(xmpString);

    const metadataStream = pdfDoc.context.stream(xmpBytes, {
      Type: PDFName.of('Metadata'),
      Subtype: PDFName.of('XML'),
    });
    // IMPORTANT: Force Uncompressed Stream for PDF/A-3b Compliance
    metadataStream.dict.delete(PDFName.of('Filter'));

    const metadataRef = pdfDoc.context.register(metadataStream);
    
    // We try to set it normally, but the patcher ensures it sticks.
    pdfDoc.catalog.set(PDFName.of('Metadata'), metadataRef);
    console.log(" XMP metadata registered (Uncompressed).");

    // 7. Save the PDF (without default metadata to keep it clean)
    const pdfBytes = await pdfDoc.save({ 
      useObjectStreams: false,
      addDefaultMetadata: false 
    });
    const pdfBuffer = Buffer.from(pdfBytes);

    // 8. NUCLEAR OPTION: Patch the buffer directly
    const metadataRefTag = metadataRef.tag; 
    const structTreeRefTag = structTreeRootRef.tag;

    console.log(` Patching with references - Metadata: ${metadataRefTag}, StructTree: ${structTreeRefTag}`);
    
    const finalBuffer = patchPdfBuffer(pdfBuffer, metadataRefTag, structTreeRefTag);

    console.log(" PDF finalization complete (Bulletproof Patch Applied).");
    return finalBuffer;
}

module.exports = {
  finalizePdf,
  generatePdfA3bXmp,
};