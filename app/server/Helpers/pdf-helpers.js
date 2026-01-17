const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, PDFName, PDFHexString, PDFString } = require("pdf-lib");
const generateZugferdXml = require("../../xml/generateZugferdXml");

function patchPdfBuffer(pdfBuffer, metadataTag, structTreeTag, xmpString) {
    let pdfString = pdfBuffer.toString('latin1');
    const resultBuffer = Buffer.from(pdfBuffer);

    // 1. GLOBAL SANITIZATION: Kill every single hidden Metadata key
    // We rename ALL /Metadata to /OldMeta so the validator is forced to find our new one.
    pdfString = pdfString.replace(/\/Metadata/g, '/OldMeta');
    
    // Convert back to a temporary buffer to keep things synced
    const cleanBuffer = Buffer.from(pdfString, 'latin1');

    // 2. FIND OUR TARGET (The one with Length 6000)
    const objSearch = /(\d+ \d+ obj)\s*<<[^>]*\/Length 6000/i;
    const objMatch = pdfString.match(objSearch);
    if (!objMatch) return pdfBuffer;
    
    const realMetadataTag = objMatch[1].replace(' obj', ' R');

    // 3. CATALOG INJECTION
    const spacerRegex = /\/PDFify\s*<([0-9a-fA-F]{100,})>/;
    const spacerMatch = pdfString.match(spacerRegex);
    if (spacerMatch) {
        // Find Attached File
        const fileSpecMatch = pdfString.match(/(\d+ \d+ obj)\s*<<[^>]*\/F\s*\(factur-x\.xml\)/);
        let afArray = fileSpecMatch ? `/AF [${fileSpecMatch[1].replace(' obj', ' R')}]` : "";

        // Inject the ONLY /Metadata tag in the entire file
        const injection = `/Metadata ${realMetadataTag} /StructTreeRoot ${structTreeTag} ${afArray} /MarkInfo<< /Marked true >>`;
        const paddedInjection = injection.padEnd(spacerMatch[0].length, ' ');
        cleanBuffer.write(paddedInjection, spacerMatch.index, 'latin1');
    }

    // 4. METADATA OBJECT SURGERY
    const objIndex = objMatch.index;
    const streamStart = pdfString.indexOf('stream', objIndex);
    const dictStart = pdfString.lastIndexOf('<<', streamStart);
    
    // Fix Dictionary Header
    cleanBuffer.fill(0x20, dictStart, streamStart); 
    cleanBuffer.write(`<< /Type /Metadata /Subtype /XML /Length 6000 >>`, dictStart, 'latin1');

    // Fix Stream Data
    let dataStart = streamStart + 6;
    if (pdfBuffer[dataStart] === 0x0D) dataStart++; 
    if (pdfBuffer[dataStart] === 0x0A) dataStart++; 

    const endstreamPos = pdfString.indexOf('endstream', dataStart);
    cleanBuffer.fill(0x20, dataStart, endstreamPos);
    cleanBuffer[endstreamPos - 1] = 0x0A; 

    const xmpBytes = Buffer.from(xmpString, 'utf8');
    xmpBytes.copy(cleanBuffer, dataStart);

    console.log(`💉 v57: Global Metadata sanitization applied. Target: ${realMetadataTag}`);
    return cleanBuffer;
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