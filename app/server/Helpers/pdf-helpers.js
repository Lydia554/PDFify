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

    // 1. FIND THE CATALOG OBJECT (The Root)
    const catalogMatch = pdfString.match(/(\d+ \d+ obj)\s*<<[^>]*\/Type\s*\/Catalog/);
    if (!catalogMatch) return pdfBuffer;

    const catalogHeader = catalogMatch[1];
    const catalogDictStart = pdfString.indexOf('<<', catalogMatch.index);
    const catalogDictEnd = pdfString.indexOf('>>', catalogDictStart);
    const originalCatalog = pdfString.slice(catalogDictStart, catalogDictEnd);

    // CRITICAL: Extract the original Pages reference
    const pagesMatch = originalCatalog.match(/\/Pages\s+\d+\s+\d+\s+R/);
    const pagesRef = pagesMatch ? pagesMatch[0] : "";

    // 2. THE NUCLEAR WIPE & REBUILD
    // We wipe the entire dictionary area between << and >>
    resultBuffer.fill(0x20, catalogDictStart + 2, catalogDictEnd);

    // Find the XML attachment for the /AF array
    const fileSpecMatch = pdfString.match(/(\d+ \d+ obj)\s*<<[^>]*\/F\s*\(factur-x\.xml\)/);
    const afArray = fileSpecMatch ? `/AF [${fileSpecMatch[1].replace(' obj', ' R')}]` : "";

    // BUILD THE "ONE TRUE CATALOG" 
    // We add /OutputIntents here MANUALLY to fix the DeviceRGB error 81 times!
    // We must find the ICC object reference
    const iccMatch = pdfString.match(/(\d+ \d+ obj)\s*<<[^>]*\/N 3/);
    const iccRef = iccMatch ? iccMatch[1].replace(' obj', ' R') : "";
    
    const outputIntent = `/OutputIntents [<< /Type /OutputIntent /S /GTS_PDFA1 /OutputConditionIdentifier (sRGB IEC61966-2.1) /Info (sRGB IEC61966-2.1) /DestOutputProfile ${iccRef} >>]`;

    const rootKeys = `/Type /Catalog ${pagesRef} /Metadata ${metadataTag} /StructTreeRoot ${structTreeTag} ${afArray} /MarkInfo << /Marked true >> ${outputIntent}`;
    resultBuffer.write(rootKeys, catalogDictStart + 2, 'latin1');

    // 3. METADATA OBJECT SURGERY (Clause 6.1.9)
    const objHeader = `${metadataTag.replace(' R', '')} obj`;
    const objIndex = pdfString.indexOf(objHeader);
    const streamMarker = pdfString.indexOf('stream', objIndex);
    
    // Wipe between 'obj' and 'stream'
    resultBuffer.fill(0x20, objIndex + objHeader.length, streamMarker);
    // Write perfectly formatted dictionary with mandatory newlines
    const cleanDict = `\n<< /Type /Metadata /Subtype /XML /Length 6000 >>\n`;
    resultBuffer.write(cleanDict, objIndex + objHeader.length, 'latin1');

    // 4. THE "CONSTANT 3" ZERO-CALIBRATION
    let dataStart = streamMarker + 6; 
    if (pdfBuffer[dataStart] === 0x0D && pdfBuffer[dataStart+1] === 0x0A) dataStart += 2;
    else if (pdfBuffer[dataStart] === 0x0A || pdfBuffer[dataStart] === 0x0D) dataStart += 1;

    const endstreamPos = pdfString.indexOf('endstream', dataStart);
    resultBuffer.fill(0x00, dataStart, endstreamPos);
    resultBuffer[endstreamPos - 1] = 0x0A; 

    const xmpBytes = Buffer.from(xmpString.trim(), 'utf8');
    xmpBytes.copy(resultBuffer, dataStart);

    console.log(`💉 v73: Absolute Hijack. Catalog, OutputIntent, and Metadata rebuilt.`);
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
    const metadataStream = Buffer.alloc(6000, 0x20); // Metadata size fixed to 6000
    const metadataRef = pdfDoc.context.register(pdfDoc.context.stream(metadataStream));
    const structTreeRef = pdfDoc.context.register(pdfDoc.context.obj({ Type: PDFName.of('StructTreeRoot') }));

    // 2. Add our "spacer" for later injection. This MUST be large enough for the injection
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
