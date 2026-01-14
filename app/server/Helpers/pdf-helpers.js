const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, PDFName, PDFHexString, PDFString } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const generateZugferdXml = require("../../xml/generateZugferdXml");

/**
 * FALLBACK ANCHOR PATCH (v27)
 * Used if the Metadata stream is completely missing.
 * Relies on the /ZF spacer being present in the Catalog.
 */
function fallbackAnchorPatch(pdfBuffer, xmpString) {
    console.log("⚠️ Metadata stream missing. Attempting fallback anchor patch...");
    const pdfString = pdfBuffer.toString('latin1');
    
    // Look for our ZF key and its hex string value < ... >
    const spacerMatch = pdfString.match(/\/ZF\s*<([0-9a-fA-F]+)>/);
    
    if (!spacerMatch) {
        console.error("❌ Critical: Spacer /ZF not found either. Patching failed.");
        return pdfBuffer;
    }

    const targetIndex = spacerMatch.index;
    const targetLength = spacerMatch[0].length;
    
    // We can't easily inject a full stream here without shifting offsets.
    // This is a last resort. We will try to inject a simple Metadata ref if we can find space.
    // But for now, let's just log the error as the "Hijack" is the primary strategy.
    console.error("❌ Fallback strategy requires complex object shifting. Aborting to prevent corruption.");
    return pdfBuffer;
}

/**
 * HIJACK PATCHER (v27 - Flexible Hijacker)
 * Finds the Metadata stream object and replaces its contents with our clean XMP.
 * This preserves object numbers AND byte-offsets.
 */
function patchPdfBuffer(pdfBuffer, xmpString) {
    const pdfString = pdfBuffer.toString('latin1');
    
    // 1. More flexible regex to find the Metadata object
    // Looking for an object that contains /Type /Metadata
    const metadataRegex = /(\d+ \d+ obj)\s*<<[^>]*\/Metadata[^>]*>>\s*stream/i;
    const match = pdfString.match(metadataRegex);
    
    if (!match) {
        console.error("❌ Critical: Metadata stream not found. Library stripped it.");
        return fallbackAnchorPatch(pdfBuffer, xmpString);
    }

    const streamStartIndex = pdfString.indexOf('stream', match.index) + 6;
    let contentStart = streamStartIndex;
    
    // Check for CR/LF after 'stream' keyword
    if (pdfBuffer[contentStart] === 0x0D) contentStart++; 
    if (pdfBuffer[contentStart] === 0x0A) contentStart++; 

    const endStreamIndex = pdfString.indexOf('endstream', contentStart);
    const originalLength = endStreamIndex - contentStart;

    const xmpBytes = new TextEncoder().encode(xmpString);
    const resultBuffer = Buffer.from(pdfBuffer);
    
    // Overwrite with our XMP and pad with spaces to keep length exactly the same
    const paddedXmp = Buffer.alloc(originalLength, 0x20); 
    paddedXmp.set(xmpBytes);
    paddedXmp.copy(resultBuffer, contentStart);

    // 2. IMPORTANT: Remove the Compression Filter if present
    // If the ghost was compressed, we must wipe the '/Filter /FlateDecode' text
    const dictStartIndex = pdfString.lastIndexOf('<<', contentStart);
    const dictEndIndex = pdfString.indexOf('>>', dictStartIndex);
    const dictText = pdfString.slice(dictStartIndex, dictEndIndex);
    
    if (dictText.includes('/Filter')) {
        const filterMatch = dictText.match(/\/Filter\s*\/FlateDecode/);
        if (filterMatch) {
            const filterOffset = dictStartIndex + filterMatch.index;
            resultBuffer.write(" ".repeat(filterMatch[0].length), filterOffset, 'latin1');
        }
    }

    console.log("💉 Ghost Metadata successfully hijacked.");
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
    console.log("✨ finalizePdf (v27 - The Visible Ghost)");

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

    // 4. FORCE THE GHOST
    // We set a long keyword string. This forces pdf-lib to create a Metadata 
    // stream and link it in the Catalog to store this info.
    const longString = "PDF-A-COMPLIANCE-BUFFER-" + " ".repeat(4000);
    pdfDoc.setKeywords([longString]); 
    pdfDoc.setSubject(longString);

    // 5. Save with defaults
    // We MUST use addDefaultMetadata: true so pdf-lib builds the XMP structure for us.
    const pdfBytes = await pdfDoc.save({ 
        useObjectStreams: false, 
        addDefaultMetadata: true 
    });

    const xmpString = generatePdfA3bXmp(invoiceData, `uuid:${id1.toLowerCase()}`, `uuid:${id2.toLowerCase()}`);

    // 7. Hijack the buffer
    return patchPdfBuffer(Buffer.from(pdfBytes), xmpString);
}

module.exports = {
  finalizePdf,
  generatePdfA3bXmp,
};