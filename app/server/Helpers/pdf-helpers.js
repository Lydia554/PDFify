const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, PDFName, PDFHexString, PDFString } = require("pdf-lib");
const generateZugferdXml = require("../../xml/generateZugferdXml");

/**
 * THE BYTE-MATCH SURGEON (v37)
 * Overwrites stream content and renames /Keywords to /Metadata.
 * This preserves exact byte alignment (both keys are 9 chars).
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

    const streamStartIndex = pdfString.indexOf('stream', objIndex) + 6;
    let contentStart = streamStartIndex;
    if (pdfBuffer[contentStart] === 0x0D) contentStart++; 
    if (pdfBuffer[contentStart] === 0x0A) contentStart++; 

    const endStreamIndex = pdfString.indexOf('endstream', contentStart);
    
    const resultBuffer = Buffer.from(pdfBuffer);
    const xmpBytes = Buffer.from(xmpString, 'utf8');
    
    // 2. Overwrite Content (fill with spaces first to be safe)
    resultBuffer.fill(0x20, contentStart, endStreamIndex);
    xmpBytes.copy(resultBuffer, contentStart);

    // 3. WIPE THE FILTER
    // We search for /Filter within the object header area
    const dictStart = pdfString.lastIndexOf('<<', contentStart);
    const headerArea = pdfString.slice(dictStart, contentStart);
    const filterMatch = headerArea.match(/\/Filter\s*\/FlateDecode/);
    if (filterMatch) {
        const filterPos = dictStart + filterMatch.index;
        resultBuffer.write(" ".repeat(filterMatch[0].length), filterPos, 'latin1');
    }

    // 4. PRECISION OVERWRITE (The v37 Fix)
    // Rename /Keywords to /Metadata (Both are 9 characters). Zero byte shift.
    const keywordMatch = pdfString.match(/\/Keywords\s+(\d+ \d+ R)/);
    if (keywordMatch) {
        resultBuffer.write("/Metadata", keywordMatch.index, 'latin1');
    }

    console.log("💉 PDF/A-3b Precision Overwrite Complete. Byte-alignment preserved.");
    return resultBuffer;
}

function generatePdfA3bXmp(invoiceData, documentId, instanceId) {
    const now = new Date().toISOString().split('.')[0] + 'Z'; 
    const padding = " ".repeat(3000);
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

    // 1. Create the Metadata Stream manually (Very large so we can overwrite)
    const metadataStream = pdfDoc.context.stream(Buffer.alloc(6000, 0x20), {
        Type: PDFName.of('Metadata'),
        Subtype: PDFName.of('XML'),
    });
    const metadataRef = pdfDoc.context.register(metadataStream);

    // 2. THE PRECISION ANCHOR: Keywords is exactly 9 bytes, just like /Metadata
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
