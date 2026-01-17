const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, PDFName, PDFHexString } = require("pdf-lib");
const generateZugferdXml = require("../../xml/generateZugferdXml");

/**
 * THE PURE NODE POST-PROCESSOR (v60)
 * Manually cleans the Catalog and injects the PDF/A-3b Requirements.
 */
function patchPdfBuffer(pdfBuffer, metadataTag, structTreeTag, xmpString) {
    const resultBuffer = Buffer.from(pdfBuffer);
    const pdfString = pdfBuffer.toString('latin1');

    // 1. NEUTRALIZING THE CATALOG (ROOT) - STEROID VERSION
    // We search for /Catalog and wipe EVERY /Metadata key in the whole file except ours.
    // This is the only way to ensure VeraPDF doesn't find a "Ghost"
    let catalogIdx = pdfString.indexOf('/Type /Catalog');
    if (catalogIdx !== -1) {
        // Find the start of the object containing this catalog
        let objStart = pdfString.lastIndexOf('obj', catalogIdx);
        let objEnd = pdfString.indexOf('endobj', catalogIdx);
        
        // Wipe all /Metadata pointers in this specific object
        let catalogSlice = pdfString.slice(objStart, objEnd);
        const metaPointerRegex = /\/Metadata\s+\d+\s+\d+\s+R/g;
        let match;
        while ((match = metaPointerRegex.exec(catalogSlice)) !== null) {
            resultBuffer.fill(0x20, objStart + match.index, objStart + match.index + match[0].length);
        }
    }

    // 2. FIND OUR TARGET (LENGTH 6000)
    const targetMatch = pdfString.match(/(\d+ \d+ obj)\s*<<[^>]*\/Length 6000/);
    if (!targetMatch) return pdfBuffer;
    const realMetaTag = targetMatch[1].replace(' obj', ' R');

    // 3. CATALOG INJECTION (VIA SPACER)
    const spacerRegex = /\/PDFify\s*<([0-9a-fA-F]{100,})>/;
    const spacerMatch = pdfString.match(spacerRegex);
    if (spacerMatch) {
        const fileSpecMatch = pdfString.match(/(\d+ \d+ obj)\s*<<[^>]*\/F\s*\(factur-x\.xml\)/);
        const afArray = fileSpecMatch ? `/AF [${fileSpecMatch[1].replace(' obj', ' R')}]` : "";
        
        // This is the one true link VeraPDF must follow
        const injection = `/Metadata ${realMetaTag} /StructTreeRoot ${structTreeTag} ${afArray} /MarkInfo<</Marked true>>`;
        const paddedInjection = injection.padEnd(spacerMatch[0].length, ' ');
        resultBuffer.write(paddedInjection, spacerMatch.index, 'latin1');
    }

    // 4. THE SURGICAL DICTIONARY FIX
    const objIndex = targetMatch.index;
    const streamIdx = pdfString.indexOf('stream', objIndex);
    
    // Wipe everything between Object Header and Stream
    const dictStart = objIndex + targetMatch[1].length;
    resultBuffer.fill(0x20, dictStart, streamIdx);
    
    // Write a mathematically perfect dictionary
    // We include a leading and trailing newline to satisfy strict structural rules
    const cleanDict = `\n<< /Type /Metadata /Subtype /XML /Length 6000 >>\n`;
    resultBuffer.write(cleanDict, dictStart, 'latin1');

    // 5. DATA CALIBRATION
    let dataStart = streamIdx + 6;
    if (pdfBuffer[dataStart] === 0x0D) dataStart++; 
    if (pdfBuffer[dataStart] === 0x0A) dataStart++; 

    const endstreamPos = pdfString.indexOf('endstream', dataStart);
    resultBuffer.fill(0x20, dataStart, endstreamPos);
    resultBuffer[endstreamPos - 1] = 0x0A; 

    const xmpBytes = Buffer.from(xmpString.trim(), 'utf8');
    xmpBytes.copy(resultBuffer, dataStart);

    console.log(`💉 v68: Neutralized Ghosts. Real Meta: ${realMetaTag}. Stream: ${dataStart}`);
    return resultBuffer;
}

function generatePdfA3bXmp(invoiceData, documentId, instanceId) {
    const now = new Date().toISOString().split('.')[0] + 'Z'; 
    const orderId = invoiceData.orderId || 'Unknown';
    
    // Strictly flat string to prevent line-ending corruption
    return `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"><pdfaid:part>3</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance></rdf:Description><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:format>application/pdf</dc:format><dc:title><rdf:Alt><rdf:li xml:lang=\"x-default\">Invoice ${orderId}</rdf:li></rdf:Alt></dc:title></rdf:Description><rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/"><xmp:CreateDate>${now}</xmp:CreateDate><xmp:ModifyDate>${now}</xmp:ModifyDate></rdf:Description><rdf:Description rdf:about="" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/"><xmpMM:DocumentID>${documentId}</xmpMM:DocumentID><xmpMM:InstanceID>${instanceId}</xmpMM:InstanceID></rdf:Description><rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#"><fx:ConformanceLevel>COMFORT</fx:ConformanceLevel><fx:DocumentFileName>factur-x.xml</fx:DocumentFileName><fx:DocumentType>INVOICE</fx:DocumentType><fx:Version>1.0</fx:Version></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
}

async function finalizePdf(pdfDoc, invoiceData) {
    const id1 = crypto.randomBytes(16).toString('hex').toUpperCase();
    const id2 = crypto.randomBytes(16).toString('hex').toUpperCase();
    pdfDoc.context.trailerInfo.ID = pdfDoc.context.obj([PDFHexString.of(id1), PDFHexString.of(id2)]);

    // Color Profile
    const iccProfilePath = path.join(__dirname, "sRGB2014.icc");
    const iccRef = pdfDoc.context.register(pdfDoc.context.stream(fs.readFileSync(iccProfilePath), { N: 3 }));
    pdfDoc.catalog.set(PDFName.of("OutputIntents"), pdfDoc.context.obj([{
        Type: PDFName.of("OutputIntent"), S: PDFName.of("GTS_PDFA1"),
        OutputConditionIdentifier: PDFHexString.fromText("sRGB IEC61966-2.1"),
        Info: PDFHexString.fromText("sRGB IEC61966-2.1"), DestOutputProfile: iccRef,
    }]));

    // 1. Allocate Metadata & StructTree
    const metadataStream = pdfDoc.context.stream(Buffer.alloc(6000, 0x20), { Length: 6000 });
    const metadataRef = pdfDoc.context.register(metadataStream);
    const structTreeRef = pdfDoc.context.register(pdfDoc.context.obj({ Type: PDFName.of('StructTreeRoot') }));

    // 2. PRE-ALLOCATE THE SPACER IN THE CATALOG
    pdfDoc.catalog.set(PDFName.of('PDFify'), PDFHexString.fromText(" ".repeat(1000)));

    // 3. Attach XML
    await pdfDoc.attach(Buffer.from(generateZugferdXml(invoiceData), "utf8"), 'factur-x.xml', {
        mimeType: "application/xml", 
        afRelationship: "Alternative",
    });

    // 4. Save (No object streams to keep binary structure predictable)
    const pdfBytes = await pdfDoc.save({ useObjectStreams: false, addDefaultMetadata: false });
    const xmpString = generatePdfA3bXmp(invoiceData, `uuid:${id1.toLowerCase()}`, `uuid:${id2.toLowerCase()}`);
    
    return patchPdfBuffer(Buffer.from(pdfBytes), metadataRef.tag, structTreeRef.tag, xmpString);
}

module.exports = { finalizePdf };

