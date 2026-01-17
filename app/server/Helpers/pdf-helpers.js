const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, PDFName, PDFHexString, PDFString } = require("pdf-lib");
const generateZugferdXml = require("../../xml/generateZugferdXml");

function patchPdfBuffer(pdfBuffer, metadataTag, structTreeTag, xmpString) {
    const resultBuffer = Buffer.from(pdfBuffer);
    const pdfString = pdfBuffer.toString('latin1');

    // 1. LOCATE THE CATALOG (The Root)
    const spacerRegex = /\/PDFify\s*<([0-9a-fA-F]{100,})>/;
    const spacerMatch = pdfString.match(spacerRegex);
    if (!spacerMatch) return pdfBuffer;

    // 2. FIND ATTACHED FILE SPEC (For /AF)
    const fileSpecMatch = pdfString.match(/(\d+ \d+ obj)\s*<<[^>]*\/F\s*\(factur-x\.xml\)/);
    let afArray = "";
    if (fileSpecMatch) {
        afArray = `/AF [${fileSpecMatch[1].replace(' obj', ' R')}]`;
    }

    // 3. CATALOG INJECTION
    // We overwrite the spacer. This is the ONLY place we write "/Metadata"
    const injection = `/Metadata ${metadataTag} /StructTreeRoot ${structTreeTag} ${afArray} /MarkInfo<< /Marked true >>`;
    const paddedInjection = injection.padEnd(spacerMatch[0].length, ' ');
    resultBuffer.write(paddedInjection, spacerMatch.index, 'latin1');

    // 4. METADATA OBJECT SURGERY (Object 9 0 R)
    const objHeader = `${metadataTag.replace(' R', '')} obj`;
    const objIndex = pdfString.indexOf(objHeader);
    const streamStart = pdfString.indexOf('stream', objIndex);
    const dictStart = pdfString.lastIndexOf('<<', streamStart);
    
    // Rewrite Dictionary Header - Use the EXACT space provided
    resultBuffer.fill(0x20, dictStart, streamStart); 
    resultBuffer.write(`<< /Type /Metadata /Subtype /XML /Length 6000 >>`, dictStart, 'latin1');

    // 5. STREAM DATA CALIBRATION
    let dataStart = streamStart + 6;
    if (pdfBuffer[dataStart] === 0x0D) dataStart++; 
    if (pdfBuffer[dataStart] === 0x0A) dataStart++; 

    const endstreamPos = pdfString.indexOf('endstream', dataStart);
    
    // Clean and fill
    resultBuffer.fill(0x20, dataStart, endstreamPos);
    resultBuffer[endstreamPos - 1] = 0x0A; // Mandatory EOL before endstream

    const xmpBytes = Buffer.from(xmpString, 'utf8');
    xmpBytes.copy(resultBuffer, dataStart);

    console.log(`💉 v58: Surgical byte-write complete. No XREF corruption. Target: ${metadataTag}`);
    return resultBuffer;
}

function generatePdfA3bXmp(invoiceData, documentId, instanceId) {
    const now = new Date().toISOString().split('.')[0] + 'Z'; 
    const orderId = invoiceData.orderId || 'Unknown';
    
    // Using begin="" (No BOM) but keeping everything else perfectly flat
    return `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"><pdfaid:part>3</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance></rdf:Description><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:format>application/pdf</dc:format><dc:title><rdf:Alt><rdf:li xml:lang="x-default">Invoice ${orderId}</rdf:li></rdf:Alt></dc:title></rdf:Description><rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/"><xmp:CreateDate>${now}</xmp:CreateDate><xmp:ModifyDate>${now}</xmp:ModifyDate></rdf:Description><rdf:Description rdf:about="" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/"><xmpMM:DocumentID>${documentId}</xmpMM:DocumentID><xmpMM:InstanceID>${instanceId}</xmpMM:InstanceID></rdf:Description><rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#"><fx:ConformanceLevel>COMFORT</fx:ConformanceLevel><fx:DocumentFileName>factur-x.xml</fx:DocumentFileName><fx:DocumentType>INVOICE</fx:DocumentType><fx:Version>1.0</fx:Version></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
}

async function finalizePdf(pdfDoc, invoiceData) {
    const id1 = crypto.randomBytes(16).toString('hex').toUpperCase();
    const id2 = crypto.randomBytes(16).toString('hex').toUpperCase();
    pdfDoc.context.trailerInfo.ID = pdfDoc.context.obj([PDFHexString.of(id1), PDFHexString.of(id2)]);

    // 1. OutputIntents (Standard)
    const iccProfilePath = path.join(__dirname, "sRGB2014.icc");
    const iccRef = pdfDoc.context.register(pdfDoc.context.stream(fs.readFileSync(iccProfilePath), { N: 3 }));
    pdfDoc.catalog.set(PDFName.of("OutputIntents"), pdfDoc.context.obj([{
        Type: PDFName.of("OutputIntent"), S: PDFName.of("GTS_PDFA1"),
        OutputConditionIdentifier: PDFHexString.fromText("sRGB IEC61966-2.1"),
        Info: PDFHexString.fromText("sRGB IEC61966-2.1"), DestOutputProfile: iccRef,
    }]));

    // 2. Metadata Pre-allocation (No Type/Subtype yet, to stay hidden from validator)
    const metadataStream = pdfDoc.context.stream(Buffer.alloc(6000, 0x20), { 
        Length: 6000,
        Padding: " ".repeat(200) 
    });
    const metadataRef = pdfDoc.context.register(metadataStream);
    const structTreeRef = pdfDoc.context.register(pdfDoc.context.obj({ Type: PDFName.of('StructTreeRoot') }));

    // 3. THE LANDING ZONE: 1000 spaces converted to Hex
    pdfDoc.catalog.set(PDFName.of('PDFify'), PDFHexString.fromText(" ".repeat(500)));

    // 4. Standard structural markers
    pdfDoc.catalog.set(PDFName.of('MarkInfo'), pdfDoc.context.obj({ Marked: true }));
    pdfDoc.catalog.set(PDFName.of('StructTreeRoot'), structTreeRef);

    // 5. Attach ZUGFeRD
    await pdfDoc.attach(Buffer.from(generateZugferdXml(invoiceData), "utf8"), 'factur-x.xml', {
        mimeType: "application/xml", 
        afRelationship: "Alternative",
    });

    // 6. SAVE - Total control mode
    const pdfBytes = await pdfDoc.save({ 
        useObjectStreams: false, 
        addDefaultMetadata: false 
    });

    const xmpString = generatePdfA3bXmp(invoiceData, `uuid:${id1.toLowerCase()}`, `uuid:${id2.toLowerCase()}`);
    return patchPdfBuffer(Buffer.from(pdfBytes), metadataRef.tag, structTreeRef.tag, xmpString);
}

module.exports = { finalizePdf };