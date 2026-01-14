const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, PDFName, PDFHexString, PDFString } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const generateZugferdXml = require("../../xml/generateZugferdXml");

/**
 * HIJACK PATCHER (v26)
 * Finds the Metadata stream object and replaces its contents with our clean XMP.
 * This preserves object numbers AND byte-offsets.
 */
function patchPdfBuffer(pdfBuffer, xmpString) {
  const pdfString = pdfBuffer.toString('latin1');
  
  // 1. Find the Metadata stream object
  // It looks like: [Number] [Gen] obj << /Type /Metadata ... >> stream ... endstream
  const metadataMatch = pdfString.match(/(\d+ \d+ obj)\s*<<[^>]*\/Type\s*\/Metadata[^>]*>>\s*stream/);
  
  if (!metadataMatch) {
    console.error("❌ Critical: Metadata stream not found. Hijack failed.");
    return pdfBuffer;
  }

  const streamStartIndex = pdfString.indexOf('stream', metadataMatch.index) + 6;
  // Move past the newline after 'stream' (usually \r\n or \n)
  let contentStart = streamStartIndex;
  if (pdfBuffer[contentStart] === 0x0D) contentStart++; // \r
  if (pdfBuffer[contentStart] === 0x0A) contentStart++; // \n

  const endStreamIndex = pdfString.indexOf('endstream', contentStart);
  const originalLength = endStreamIndex - contentStart;

  // 2. Prepare our XMP (Must be padded to match original length exactly)
  const xmpBytes = new TextEncoder().encode(xmpString);
  if (xmpBytes.length > originalLength) {
    console.error(`❌ XMP too large. Need ${xmpBytes.length}, have ${originalLength}.`);
    return pdfBuffer;
  }

  // Create a buffer of the exact original length filled with spaces
  const paddedXmp = Buffer.alloc(originalLength, 0x20); 
  paddedXmp.set(xmpBytes);

  // 3. Perform the overwrite
  const resultBuffer = Buffer.from(pdfBuffer);
  paddedXmp.copy(resultBuffer, contentStart);

  console.log("💉 Ghost Metadata hijacked and overwritten. Byte-offsets preserved.");
  return resultBuffer;
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
  const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
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
<?xpacket end="w"?>`;

  return xmp.trim();
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
    console.log("✨ finalizePdf (v26 - The Hijack)");

    // 1. Standard PDF/A requirements
    const id1 = crypto.randomBytes(16).toString('hex').toUpperCase();
    const id2 = crypto.randomBytes(16).toString('hex').toUpperCase();
    pdfDoc.context.trailerInfo.ID = pdfDoc.context.obj([PDFHexString.of(id1), PDFHexString.of(id2)]);

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

    // 3. Attach ZUGFeRD
    await embedZugferdXml(pdfDoc, invoiceData);
    
    // 3.1. Mark as Tagged & Add StructTreeRoot (Required for PDF/A-3b)
    // pdf-lib might not add these automatically, so we ensure they are present.
    const structTreeRoot = pdfDoc.context.obj({
      Type: PDFName.of('StructTreeRoot'),
    });
    const structTreeRootRef = pdfDoc.context.register(structTreeRoot);
    pdfDoc.catalog.set(PDFName.of('StructTreeRoot'), structTreeRootRef);
    pdfDoc.catalog.set(PDFName.of('MarkInfo'), pdfDoc.context.obj({ Marked: true }));

    // 4. TRIGGER THE GHOST: Use pdf-lib's built-in setter to ensure 
    // it creates the /Metadata key and stream for us to hijack.
    // We provide a massive string of spaces so the "Ghost" is big enough.
    const initialPadding = " ".repeat(4000);
    pdfDoc.setKeywords([initialPadding]); 

    // 5. Save (pdf-lib will compress this, but we will overwrite it with uncompressed text)
    const pdfBytes = await pdfDoc.save({ 
        useObjectStreams: false, 
        addDefaultMetadata: true // We WANT the ghost now
    });

    // 6. Generate our REAL XMP
    const xmpString = generatePdfA3bXmp(invoiceData, `uuid:${id1.toLowerCase()}`, `uuid:${id2.toLowerCase()}`);

    // 7. Hijack the buffer
    return patchPdfBuffer(Buffer.from(pdfBytes), xmpString);
}

module.exports = {
  finalizePdf,
  generatePdfA3bXmp,
};