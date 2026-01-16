const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, PDFName, PDFHexString, PDFString } = require("pdf-lib");
const generateZugferdXml = require("../../xml/generateZugferdXml");

/**
 * THE MASTER PATCHER (v38)
 * 1. Overwrites stream content while preserving EOL markers.
 * 2. Renames /Keywords to /Metadata (Zero-Shift).
 */
function patchPdfBuffer(pdfBuffer, metadataTag, xmpString) {
    const pdfString = pdfBuffer.toString('latin1');
    
    // 1. Find the object by its ID (e.g., "12 0 obj")
    const objectHeader = `${metadataTag.replace(' R', '')} obj`;
    const objIndex = pdfString.indexOf(objectHeader);
    
    if (objIndex === -1) {
        console.error(`❌ Critical: Metadata Object ${objectHeader} not found in buffer.`);
        return pdfBuffer;
    }

    // Locate the exact start of the data after 'stream'
    // PDF/A-3b requires a newline immediately after 'stream'
    const streamMarker = pdfString.indexOf('stream', objIndex);
    let dataStart = streamMarker + 6;
    if (pdfBuffer[dataStart] === 0x0D) dataStart++; // CR
    if (pdfBuffer[dataStart] === 0x0A) dataStart++; // LF

    const endMarker = pdfString.indexOf('endstream', dataStart);
    const resultBuffer = Buffer.from(pdfBuffer);

    // 2. Wipe the area with spaces (0x20)
    // We leave the EOL marker before endstream untouched
    resultBuffer.fill(0x20, dataStart, endMarker);

    // 3. Write the XMP
    const xmpBytes = Buffer.from(xmpString, 'utf8');
    xmpBytes.copy(resultBuffer, dataStart);

    // 4. WIPE THE FILTER
    const dictStart = pdfString.lastIndexOf('<<', streamMarker);
    const headerArea = pdfString.slice(dictStart, streamMarker);
    const filterMatch = headerArea.match(/\/Filter\s*\/FlateDecode/);
    if (filterMatch) {
        const filterPos = dictStart + filterMatch.index;
        resultBuffer.write(" ".repeat(filterMatch[0].length), filterPos, 'latin1');
    }

    // 5. PRECISION OVERWRITE: Rename /Keywords to /Metadata
    const keywordMatch = pdfString.match(/\/Keywords\s+(\d+ \d+ R)/);
    if (keywordMatch) {
        resultBuffer.write("/Metadata", keywordMatch.index, 'latin1');
    }

    console.log("💉 PDF/A-3b Master Patch applied. Lengths and EOLs preserved.");
    return resultBuffer;
}

function generatePdfA3bXmp(invoiceData, documentId, instanceId) {
    const now = new Date().toISOString().split('.')[0] + 'Z'; 
    const padding = " ".repeat(3000);
    // Remove .trim() from the join to keep it clean
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

    // 1. Create a RAW stream with a hardcoded Length of 6000
    // We do NOT use pdf-lib's automatic length calculation
    const metadataStream = pdfDoc.context.stream(Buffer.alloc(6000, 0x20), {
        Type: PDFName.of('Metadata'),
        Subtype: PDFName.of('XML'),
        Length: 6000, // <--- EXPLICIT FIXED LENGTH
    });
    // Ensure no Filter (no compression)
    metadataStream.dict.delete(PDFName.of('Filter'));
    const metadataRef = pdfDoc.context.register(metadataStream);

    // 2. The Anchor (9 chars)
    pdfDoc.catalog.set(PDFName.of('Keywords'), metadataRef);
    
    // 3. Mark Info and StructTree
    pdfDoc.catalog.set(PDFName.of('MarkInfo'), pdfDoc.context.obj({ Marked: true }));
    const structTreeRef = pdfDoc.context.register(pdfDoc.context.obj({ Type: PDFName.of('StructTreeRoot') }));
    pdfDoc.catalog.set(PDFName.of('StructTreeRoot'), structTreeRef);

    await pdfDoc.attach(Buffer.from(generateZugferdXml(invoiceData), "utf8"), 'factur-x.xml', {
        mimeType: "application/xml", afRelationship: "Alternative"
    });

    const pdfBytes = await pdfDoc.save({ useObjectStreams: false, addDefaultMetadata: false });
    
    const xmpString = generatePdfA3bXmp(invoiceData, `uuid:${id1.toLowerCase()}`, `uuid:${id2.toLowerCase()}`);
    
    // We pass the Tag so the patcher knows EXACTLY which object to look for
    return patchPdfBuffer(Buffer.from(pdfBytes), metadataRef.tag, xmpString);
}

module.exports = { finalizePdf };