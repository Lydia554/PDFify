const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, PDFName, PDFHexString, PDFString } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const generateZugferdXml = require("../../xml/generateZugferdXml");

/**
 * CATALOG SURGEON (v32 - The Persistent Anchor)
 * 1. Finds the /ZF <...> spacer in the Catalog.
 * 2. Overwrites it with /Metadata and /StructTreeRoot links.
 * 3. Relies on /PieceInfo to keep the objects alive during save.
 */
function patchPdfBuffer(pdfBuffer, metadataRef, structTreeRef) {
    const pdfString = pdfBuffer.toString('latin1');
    
    // 1. Locate the /ZF spacer key-value pair in the Catalog
    // It looks like /ZF <202020...>
    const zfRegex = /\/ZF\s*<[0-9a-fA-F]{50,}>/g;
    const matches = [...pdfString.matchAll(zfRegex)];

    if (matches.length < 1) {
        console.error("❌ Critical: /ZF Spacer not found in Catalog. Patching failed.");
        return pdfBuffer;
    }

    const match = matches[0];
    const targetIndex = match.index;
    const targetLength = match[0].length;

    // 2. Prepare the injection
    // We replace "/ZF <...>" with "/Metadata ... /StructTreeRoot ..."
    // We pad with spaces to ensure exact length match.
    const injection = `/Metadata ${metadataRef} /StructTreeRoot ${structTreeRef} /MarkInfo<</Marked true>>`;
    
    if (injection.length > targetLength) {
        console.error("❌ Injection too long for available space.");
        return pdfBuffer;
    }

    const paddedInjection = injection.padEnd(targetLength, ' ');

    // 3. Perform the Overwrite
    const resultBuffer = Buffer.from(pdfBuffer);
    resultBuffer.write(paddedInjection, targetIndex, 'latin1');

    console.log("💉 PDF surgically patched (v32). Metadata linked in Catalog Root.");
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
    console.log("✨ finalizePdf (v32 - The Persistent Anchor)");

    // 1. Set IDs
    const id1 = crypto.randomBytes(16).toString('hex').toUpperCase();
    const id2 = crypto.randomBytes(16).toString('hex').toUpperCase();
    pdfDoc.context.trailerInfo.ID = pdfDoc.context.obj([PDFHexString.of(id1), PDFHexString.of(id2)]);

    // 2. OutputIntents (Standard)
    const iccProfilePath = path.join(__dirname, "sRGB2014.icc");
    const iccRef = pdfDoc.context.register(
        pdfDoc.context.stream(fs.readFileSync(iccProfilePath), { N: 3 })
    );
    const outputIntent = pdfDoc.context.obj({
        Type: PDFName.of("OutputIntent"),
        S: PDFName.of("GTS_PDFA1"),
        OutputConditionIdentifier: PDFHexString.fromText("sRGB IEC61966-2.1"), 
        Info: PDFHexString.fromText("sRGB IEC61966-2.1"),
        DestOutputProfile: iccRef,
    });
    pdfDoc.catalog.set(PDFName.of("OutputIntents"), pdfDoc.context.obj([outputIntent]));

    // 3. Register Objects
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

    // 4. THE ANCHOR: Keep objects alive using standard /PieceInfo
    // This forces pdf-lib to write the metadataStream and structTreeRoot to the file
    // because they are referenced by a reachable object (the Catalog).
    const pieceInfo = pdfDoc.context.obj({
        PDFifyData: pdfDoc.context.obj({
            PrivateM: metadataRef,
            PrivateS: structTreeRef
        })
    });
    pdfDoc.catalog.set(PDFName.of("PieceInfo"), pieceInfo);

    // 5. THE LANDING ZONE: A big spacer in the Catalog
    // We will overwrite this with the real /Metadata links later.
    // 300 spaces is plenty.
    pdfDoc.catalog.set(PDFName.of("ZF"), PDFHexString.fromText(" ".repeat(300)));

    // 6. Attach ZUGFeRD
    await embedZugferdXml(pdfDoc, invoiceData);

    // 7. Save
    const pdfBytes = await pdfDoc.save({ useObjectStreams: false, addDefaultMetadata: false });
    
    // 8. Patch
    return patchPdfBuffer(Buffer.from(pdfBytes), metadataRef.tag, structTreeRef.tag);
}

module.exports = {
  finalizePdf,
  generatePdfA3bXmp,
};