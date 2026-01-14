const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, PDFName, PDFHexString, PDFString } = require("pdf-lib");
const generateZugferdXml = require("../../xml/generateZugferdXml");

/**
 * DETERMINISTIC PATCHER (v34)
 * Finds the /PieceInfo anchor in the Catalog and overwrites it 
 * with the mandatory PDF/A-3b keys.
 */
function patchPdfBuffer(pdfBuffer, metadataRef, structTreeRef) {
    const pdfString = pdfBuffer.toString('latin1');
    
    // Look for our anchor: /PieceInfo << /PDFify < ... > >>
    // This is guaranteed to be in the Catalog because we set it in finalizePdf
    const anchorRegex = /\/PieceInfo\s*<<[^>]*\/PDFify\s*<([0-9a-fA-F]+)>[^>]*>>/;
    const match = pdfString.match(anchorRegex);
    
    if (!match) {
        console.error("❌ Critical: Anchor /PieceInfo not found. pdf-lib stripped the Catalog link.");
        return pdfBuffer;
    }

    const targetIndex = match.index;
    const targetLength = match[0].length;

    // Inject the real PDF/A-3b keys
    const injection = `/Metadata ${metadataRef} /StructTreeRoot ${structTreeRef} /MarkInfo<</Marked true>>`;
    
    // Pad with spaces to preserve EXACT byte offsets
    const paddedInjection = injection.padEnd(targetLength, ' ');

    const resultBuffer = Buffer.from(pdfBuffer);
    resultBuffer.write(paddedInjection, targetIndex, 'latin1');

    console.log("💉 PDF surgically patched (v34). Byte-offsets preserved.");
    return resultBuffer;
}

function generatePdfA3bXmp(invoiceData, documentId, instanceId) {
    const now = new Date().toISOString().split('.')[0] + 'Z'; 
    const padding = " ".repeat(2000);
    return [
        '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>',
        '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
        '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
        '<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">',
        '<pdfaid:part>3</pdfaid:part>',
        '<pdfaid:conformance>B</pdfaid:conformance>',
        '</rdf:Description>',
        '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">',
        '<dc:format>application/pdf</dc:format>',
        `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">Invoice ${invoiceData.orderId || ''}</rdf:li></rdf:Alt></dc:title>`,
        '</rdf:Description>',
        '<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">',
        `<xmp:CreateDate>${now}</xmp:CreateDate>`, 
        `<xmp:ModifyDate>${now}</xmp:ModifyDate>`, 
        '</rdf:Description>',
        '<rdf:Description rdf:about="" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/">',
        `<xmpMM:DocumentID>${documentId}</xmpMM:DocumentID>`, 
        `<xmpMM:InstanceID>${instanceId}</xmpMM:InstanceID>`, 
        '</rdf:Description>',
        '<rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">',
        '<fx:ConformanceLevel>COMFORT</fx:ConformanceLevel>',
        '<fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>',
        '<fx:DocumentType>INVOICE</fx:DocumentType>',
        '<fx:Version>1.0</fx:Version>',
        '</rdf:Description>',
        '</rdf:RDF>',
        '</x:xmpmeta>',
        padding,
        '<?xpacket end="w"?>'
    ].join('\n');
}

async function finalizePdf(pdfDoc, invoiceData) {
    // 1. Trailer IDs
    const id1 = crypto.randomBytes(16).toString('hex').toUpperCase();
    const id2 = crypto.randomBytes(16).toString('hex').toUpperCase();
    pdfDoc.context.trailerInfo.ID = pdfDoc.context.obj([PDFHexString.of(id1), PDFHexString.of(id2)]);
    
    // 2. ICC Profile & OutputIntents
    const iccProfilePath = path.join(__dirname, "sRGB2014.icc");
    const iccRef = pdfDoc.context.register(pdfDoc.context.stream(fs.readFileSync(iccProfilePath), { N: 3 }));
    pdfDoc.catalog.set(PDFName.of("OutputIntents"), pdfDoc.context.obj([{ 
        Type: PDFName.of("OutputIntent"), S: PDFName.of("GTS_PDFA1"),
        OutputConditionIdentifier: PDFHexString.fromText("sRGB IEC61966-2.1"),
        Info: PDFHexString.fromText("sRGB IEC61966-2.1"), DestOutputProfile: iccRef,
    }]));

    // 3. Register our XMP Metadata stream (Explicitly Uncompressed)
    const xmpString = generatePdfA3bXmp(invoiceData, `uuid:${id1.toLowerCase()}`, `uuid:${id2.toLowerCase()}`);
    const metadataStream = pdfDoc.context.stream(Buffer.from(xmpString, 'utf8'), {
        Type: PDFName.of('Metadata'),
        Subtype: PDFName.of('XML'),
    });
    metadataStream.dict.delete(PDFName.of('Filter'));
    const metadataRef = pdfDoc.context.register(metadataStream);

    // 4. Register StructTreeRoot
    const structTreeRef = pdfDoc.context.register(pdfDoc.context.obj({ Type: PDFName.of('StructTreeRoot') }));

    // 5. THE ANCHOR: We use PieceInfo to "carry" our object references through the save process
    // This creates a reachable path for the objects so pdf-lib doesn't garbage collect them.
    const anchor = pdfDoc.context.obj({
        PDFify: PDFHexString.fromText(" ".repeat(250)) // Huge spacer
    });
    pdfDoc.catalog.set(PDFName.of("PieceInfo"), anchor);

    await pdfDoc.attach(Buffer.from(generateZugferdXml(invoiceData), "utf8"), 'factur-x.xml', {
        mimeType: "application/xml", afRelationship: "Alternative"
    });

    // 6. SAVE (Wait for pdf-lib to finish)
    // We use addDefaultMetadata: FALSE to ensure we have total control
    const pdfBytes = await pdfDoc.save({ useObjectStreams: false, addDefaultMetadata: false });
    
    // 7. PATCH using the tags registered in step 3 and 4
    return patchPdfBuffer(Buffer.from(pdfBytes), metadataRef.tag, structTreeRef.tag);
}

module.exports = { finalizePdf };