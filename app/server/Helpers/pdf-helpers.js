const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, PDFName, PDFHexString, PDFString } = require("pdf-lib");
const generateZugferdXml = require("../../xml/generateZugferdXml");

function patchPdfBuffer(pdfBuffer, metadataTag, structTreeTag, xmpString) {
    let pdfString = pdfBuffer.toString('latin1');
    const resultBuffer = Buffer.from(pdfBuffer);

    // 1. FIND THE EMBEDDED FILE SPEC (For /AF array)
    const fileSpecMatch = pdfString.match(/(\d+ \d+ obj)\s*<<[^>]*\/F\s*\(factur-x\.xml\)/);
    let afArray = "";
    if (fileSpecMatch) {
        const fileRef = fileSpecMatch[1].replace(' obj', ' R');
        afArray = `/AF [${fileRef}]`;
    }

    // 2. SURGICAL METADATA OBJECT FIX
    const objHeaderTag = `${metadataTag.replace(' R', '')} obj`;
    const objIndex = pdfString.indexOf(objHeaderTag);
    const streamStart = pdfString.indexOf('stream', objIndex);
    const dictStart = pdfString.lastIndexOf('<<', streamStart);
    
    // Hard-overwrite dictionary: No Filters, No Compression
    resultBuffer.fill(0x20, dictStart, streamStart); 
    resultBuffer.write(`<< /Type /Metadata /Subtype /XML /Length 6000 >>`, dictStart, 'latin1');

    // 3. STREAM DATA OVERWRITE
    const streamDataStart = streamStart + 6 + (pdfBuffer[streamStart+6] === 0x0D ? 2 : 1);
    const endstream = pdfString.indexOf('endstream', streamDataStart);
    
    // Fill with spaces, but ensure the byte immediately before endstream is a Newline
    resultBuffer.fill(0x20, streamDataStart, endstream);
    resultBuffer[endstream - 1] = 0x0A; 

    // Write XMP starting at byte 0 of the stream
    const xmpBytes = Buffer.from(xmpString, 'utf8');
    xmpBytes.copy(resultBuffer, streamDataStart);

    // 4. CATALOG INJECTION (Linking everything)
    const spacerRegex = /\/PDFify\s*<[0-9a-fA-F]{100,}>/;
    const spacerMatch = pdfString.match(spacerRegex);
    if (spacerMatch) {
        const injection = `/Metadata ${metadataTag} /StructTreeRoot ${structTreeTag} ${afArray} /MarkInfo<< /Marked true >>`;
        const paddedInjection = injection.padEnd(spacerMatch[0].length, ' ');
        resultBuffer.write(paddedInjection, spacerMatch.index, 'latin1');
    }

    // 5. THE NUCLEAR CLEANUP (Global Sanitization)
    // Rename all other /Metadata occurrences to prevent validator confusion
    let finalPdfStr = resultBuffer.toString('latin1');
    const globalSanitize = new RegExp(`\/Metadata(?!\s+${metadataTag})`, 'g');
    finalPdfStr = finalPdfStr.replace(globalSanitize, '/OldMeta');

    console.log("💉 PDF/A-3b Surgery v51: Complete.");
    return Buffer.from(finalPdfStr, 'latin1');
}

function generatePdfA3bXmp(invoiceData, documentId, instanceId) {
    const now = new Date().toISOString().split('.')[0] + 'Z'; 
    const orderId = invoiceData.orderId || 'Unknown';
    
    // Use a flat string with NO extra spaces or tabs from JS indentation
    const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"><pdfaid:part>3</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance></rdf:Description><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:format>application/pdf</dc:format><dc:title><rdf:Alt><rdf:li xml:lang="x-default">Invoice ${orderId}</rdf:li></rdf:Alt></dc:title></rdf:Description><rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/"><xmp:CreateDate>${now}</xmp:CreateDate><xmp:ModifyDate>${now}</xmp:ModifyDate></rdf:Description><rdf:Description rdf:about="" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/"><xmpMM:DocumentID>${documentId}</xmpMM:DocumentID><xmpMM:InstanceID>${instanceId}</xmpMM:InstanceID></rdf:Description><rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#"><fx:ConformanceLevel>COMFORT</fx:ConformanceLevel><fx:DocumentFileName>factur-x.xml</fx:DocumentFileName><fx:DocumentType>INVOICE</fx:DocumentType><fx:Version>1.0</fx:Version></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;

    return xmp;
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

    // 1. Metadata Pre-allocation with large Padding
    const metadataStream = pdfDoc.context.stream(Buffer.alloc(6000, 0x20), { 
        Length: 6000,
        Padding: " ".repeat(200) 
    });
    const metadataRef = pdfDoc.context.register(metadataStream);
    const structTreeRef = pdfDoc.context.register(pdfDoc.context.obj({ Type: PDFName.of('StructTreeRoot') }));

    // 2. Large Catalog Spacer
    pdfDoc.catalog.set(PDFName.of('PDFify'), PDFHexString.fromText(" ".repeat(1000)));

    // 3. Attach ZUGFeRD
    const xmlBuffer = Buffer.from(generateZugferdXml(invoiceData), "utf8");
    await pdfDoc.attach(xmlBuffer, 'factur-x.xml', {
        mimeType: "application/xml", 
        afRelationship: "Alternative",
        description: "Factur-X Invoice",
    });

    const pdfBytes = await pdfDoc.save({ useObjectStreams: false, addDefaultMetadata: false });
    const xmpString = generatePdfA3bXmp(invoiceData, `uuid:${id1.toLowerCase()}`, `uuid:${id2.toLowerCase()}`);
    
    return patchPdfBuffer(Buffer.from(pdfBytes), metadataRef.tag, structTreeRef.tag, xmpString);
}

module.exports = { finalizePdf };