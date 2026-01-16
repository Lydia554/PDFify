const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, PDFName, PDFHexString, PDFString } = require("pdf-lib");
const generateZugferdXml = require("../../xml/generateZugferdXml");

/**
 * THE UNIVERSAL HIJACKER (v39)
 * Finds the metadata object by its specific properties (Length 6000)
 * and performs a byte-perfect overwrite.
 */
function patchPdfBuffer(pdfBuffer, xmpString) {
    const pdfString = pdfBuffer.toString('latin1');
    
    // 1. Find the object that we specifically gave a Length of 6000
    const metadataRegex = /(\d+ \d+ obj)\s*<<[^>]*\/Type\s*\/Metadata[^>]*\/Length\s+6000[^>]*>>\s*stream/i;
    const match = pdfString.match(metadataRegex);
    
    if (!match) {
        console.error("❌ Critical: Metadata object with Length 6000 not found.");
        return pdfBuffer;
    }

    const streamStartIndex = pdfString.indexOf('stream', match.index) + 6;
    let dataStart = streamStartIndex;
    
    // Strict PDF/A-3b EOL Check
    if (pdfBuffer[dataStart] === 0x0D) dataStart++; 
    if (pdfBuffer[dataStart] === 0x0A) dataStart++; 

    // The validator expects EXACTLY 6000 bytes here
    const dataEnd = dataStart + 6000;
    
    // Binary alignment logging
    const actualEndstreamPos = pdfString.indexOf('endstream', dataStart);
    console.log(`📊 Binary Check: DataStart: ${dataStart}, ExpectedEnd: ${dataEnd}, ActualEndstream: ${actualEndstreamPos}`);

    const resultBuffer = Buffer.from(pdfBuffer);
    const xmpBytes = Buffer.from(xmpString, 'utf8');

    // 2. Wipe the 6000 bytes with spaces (0x20)
    resultBuffer.fill(0x20, dataStart, dataEnd);
    
    // 3. Write the XMP at the start of the cleared area
    xmpBytes.copy(resultBuffer, dataStart);

    // 4. PRECISION OVERWRITE: Rename /Keywords to /Metadata
    const keywordMatch = pdfString.match(/\/Keywords\s+(\d+ \d+ R)/);
    if (keywordMatch) {
        resultBuffer.write("/Metadata", keywordMatch.index, 'latin1');
    }

    console.log("💉 PDF/A-3b Master Patch (v39) applied. Byte-offsets preserved.");
    return resultBuffer;
}

function generatePdfA3bXmp(invoiceData, documentId, instanceId) {
    const now = new Date().toISOString().split('.')[0] + 'Z'; 
    const padding = " ".repeat(3000);
    
    // Simple join, no trim, to ensure consistent line endings
    return [
        '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>',
        '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
        '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
        '<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">',
        '<pdfaid:part>3</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance>',
        '</rdf:Description>',
        '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">',
        '<dc:format>application/pdf</dc:format>',
        `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">Invoice ${invoiceData.orderId || ''}</rdf:li></rdf:Alt></dc:title>`,
        '</rdf:Description>',
        '<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">',
        `<xmp:CreateDate>${now}</xmp:CreateDate><xmp:ModifyDate>${now}</xmp:ModifyDate>`, 
        '</rdf:Description>',
        '<rdf:Description rdf:about="" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/">',
        `<xmpMM:DocumentID>${documentId}</xmpMM:DocumentID><xmpMM:InstanceID>${instanceId}</xmpMM:InstanceID>`, 
        '</rdf:Description>',
        '<rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">',
        '<fx:ConformanceLevel>COMFORT</fx:ConformanceLevel>',
        '<fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>',
        '<fx:DocumentType>INVOICE</fx:DocumentType>',
        '<fx:Version>1.0</fx:Version>',
        '</rdf:Description>',
        '</rdf:RDF></x:xmpmeta>',
        padding,
        '<?xpacket end="w"?>'
    ].join('\n');
}

async function finalizePdf(pdfDoc, invoiceData) {
    const id1 = crypto.randomBytes(16).toString('hex').toUpperCase();
    const id2 = crypto.randomBytes(16).toString('hex').toUpperCase();
    pdfDoc.context.trailerInfo.ID = pdfDoc.context.obj([PDFHexString.of(id1), PDFHexString.of(id2)]);

    const iccProfilePath = path.join(__dirname, "sRGB2014.icc");
    const iccRef = pdfDoc.context.register(pdfDoc.context.stream(fs.readFileSync(iccProfilePath), { N: 3 }));
    pdfDoc.catalog.set(PDFName.of("OutputIntents"), pdfDoc.context.obj([{ 
        Type: PDFName.of("OutputIntent"), S: PDFName.of("GTS_PDFA1"),
        OutputConditionIdentifier: PDFHexString.fromText("sRGB IEC61966-2.1"),
        Info: PDFHexString.fromText("sRGB IEC61966-2.1"), DestOutputProfile: iccRef,
    }]));

    // 1. Create the Metadata Stream with hardcoded Length 6000
    const metadataStream = pdfDoc.context.stream(Buffer.alloc(6000, 0x20), {
        Type: PDFName.of('Metadata'),
        Subtype: PDFName.of('XML'),
        Length: 6000,
    });
    metadataStream.dict.delete(PDFName.of('Filter'));
    const metadataRef = pdfDoc.context.register(metadataStream);

    // 2. The Anchor
    pdfDoc.catalog.set(PDFName.of('Keywords'), metadataRef);
    
    // 3. Mark Info and StructTree
    pdfDoc.catalog.set(PDFName.of('MarkInfo'), pdfDoc.context.obj({ Marked: true }));
    const structTreeRef = pdfDoc.context.register(pdfDoc.context.obj({ Type: PDFName.of('StructTreeRoot') }));
    pdfDoc.catalog.set(PDFName.of('StructTreeRoot'), structTreeRef);

    await pdfDoc.attach(Buffer.from(generateZugferdXml(invoiceData), "utf8"), 'factur-x.xml', {
        mimeType: "application/xml", afRelationship: "Alternative"
    });

    const pdfBytes = await pdfDoc.save({
        useObjectStreams: false, 
        addDefaultMetadata: false,
        updateFieldAppearances: false
    });
    
    const xmpString = generatePdfA3bXmp(invoiceData, `uuid:${id1.toLowerCase()}`, `uuid:${id2.toLowerCase()}`);
    
    // Deterministic search in the buffer
    return patchPdfBuffer(Buffer.from(pdfBytes), xmpString);
}

module.exports = { finalizePdf };
