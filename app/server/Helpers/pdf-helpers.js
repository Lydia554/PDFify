const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, PDFName, PDFHexString, PDFString } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const generateZugferdXml = require("../../xml/generateZugferdXml");

/**
 * BYTE-PERFECT OVERWRITE (v30 - Fixed Hex-break)
 * Finds the Hex Spacer we hid inside the OutputIntent and overwrites it.
 * We close the hex string immediately with '>' to prevent structural errors.
 */
function patchPdfBuffer(pdfBuffer, metadataRef, structTreeRef) {
    const pdfString = pdfBuffer.toString('latin1');
    
    // 1. Locate the hex spacer <73524742...>
    const hexSpacerRegex = /<[0-9a-fA-F]{20,}>/g;
    const matches = [...pdfString.matchAll(hexSpacerRegex)];

    if (matches.length < 1) {
        console.error("❌ Critical: Hex Spacer not found.");
        return pdfBuffer;
    }

    const match = matches[0];
    const targetIndex = match.index;
    const targetLength = match[0].length;

    // 2. Prepare the injection
    // We CLOSE the HexString immediately with '>', then inject our keys.
    // The rest of the space will be filled with ' ' (ignored by PDF parsers inside a dictionary)
    const injection = `> /Metadata ${metadataRef} /MarkInfo<</Marked true>> /StructTreeRoot ${structTreeRef}`;
    
    // 3. Perform the Overwrite
    // We pad with spaces to ensure the total length remains EXACTLY targetLength.
    // This preserves file size and avoids creating invalid '>>' sequences.
    const paddedInjection = injection.padEnd(targetLength, ' ');

    const resultBuffer = Buffer.from(pdfBuffer);
    resultBuffer.write(paddedInjection, targetIndex, 'latin1');

    console.log("💉 PDF surgically patched. Hex-break error fixed.");
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
    console.log("✨ finalizePdf (v29 - Byte-Perfect Overwrite)");

    // 1. Set IDs
    const id1 = crypto.randomBytes(16).toString('hex').toUpperCase();
    const id2 = crypto.randomBytes(16).toString('hex').toUpperCase();
    pdfDoc.context.trailerInfo.ID = pdfDoc.context.obj([PDFHexString.of(id1), PDFHexString.of(id2)]);

    // 2. Create OutputIntent with a massive HexString spacer
    const iccProfilePath = path.join(__dirname, "sRGB2014.icc");
    // We register the ICC stream manually to ensure it has a reference
    const iccRef = pdfDoc.context.register(
        pdfDoc.context.stream(fs.readFileSync(iccProfilePath), { N: 3 })
    );
    
    const outputIntent = pdfDoc.context.obj({
        Type: PDFName.of("OutputIntent"),
        S: PDFName.of("GTS_PDFA1"),
        // This creates a huge block of hex in the Catalog we can safely overwrite
        // The hex string for spaces (0x20) will be our target.
        OutputConditionIdentifier: PDFHexString.fromText("sRGB" + " ".repeat(250)), 
        Info: PDFHexString.fromText("sRGB IEC61966-2.1"),
        DestOutputProfile: iccRef,
    });
    pdfDoc.catalog.set(PDFName.of("OutputIntents"), pdfDoc.context.obj([outputIntent]));

    // 3. Register our REAL XMP Metadata (Uncompressed) & StructTreeRoot
    const xmpString = generatePdfA3bXmp(invoiceData, `uuid:${id1.toLowerCase()}`, `uuid:${id2.toLowerCase()}`);
    const metadataStream = pdfDoc.context.stream(new TextEncoder().encode(xmpString), {
        Type: PDFName.of('Metadata'),
        Subtype: PDFName.of('XML'),
    });
    metadataStream.dict.delete(PDFName.of('Filter'));
    const metadataRef = pdfDoc.context.register(metadataStream);

    const structTreeRef = pdfDoc.context.register(
        pdfDoc.context.obj({ Type: PDFName.of('StructTreeRoot') })
    );

    // 4. Attach ZUGFeRD
    await embedZugferdXml(pdfDoc, invoiceData);

    // 5. Save (No optimization, no default metadata to keep it clean)
    const pdfBytes = await pdfDoc.save({ useObjectStreams: false, addDefaultMetadata: false });
    
    // 6. Overwrite (This keeps file size identical)
    return patchPdfBuffer(Buffer.from(pdfBytes), metadataRef.tag, structTreeRef.tag);
}

module.exports = {
  finalizePdf,
  generatePdfA3bXmp,
};