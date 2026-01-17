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
    let pdfString = pdfBuffer.toString('latin1');
    const resultBuffer = Buffer.from(pdfBuffer);

    // 1. RE-LINK THE CATALOG (Exactly as the validator wants)
    const catalogMatch = pdfString.match(/(\d+ \d+ obj)\s*<<[^>]*\/Type\s*\/Catalog/);
    if (catalogMatch) {
        const catalogStart = pdfString.indexOf('<<', catalogMatch.index);
        const catalogEnd = pdfString.indexOf('>>', catalogStart);
        const pagesRef = (pdfString.slice(catalogStart, catalogEnd).match(/\/Pages\s+\d+\s+\d+\s+R/) || [""])[0];
        
        resultBuffer.fill(0x20, catalogStart + 2, catalogEnd);
        const fileSpecMatch = pdfString.match(/(\d+ \d+ obj)\s*<<[^>]*\/F\s*\(factur-x\.xml\)/);
        const afArray = fileSpecMatch ? `/AF [${fileSpecMatch[1].replace(' obj', ' R')}]` : "";
        
        const rootKeys = `/Type /Catalog ${pagesRef} /Metadata ${metadataTag} /StructTreeRoot ${structTreeTag} ${afArray} /MarkInfo << /Marked true >>`;
        resultBuffer.write(rootKeys, catalogStart + 2, 'latin1');
    }

    // 2. THE NUCLEAR REPLACEMENT (The Metadata Object)
    const objNum = metadataTag.split(' ')[0];
    const objHeader = `${objNum} 0 obj`;
    const objIndex = pdfString.indexOf(objHeader);
    const endObjIndex = pdfString.indexOf('endobj', objIndex) + 6;

    // We WIPE the entire original object area to zeros
    resultBuffer.fill(0x00, objIndex, endObjIndex);

    // We build a PERFECT, STATIC PDF OBJECT
    // No library influence, just raw compliant bytes
    const trimmedXmp = xmpString.trim();
    const xmpLength = Buffer.byteLength(trimmedXmp, 'utf8');
    
    // We keep the Length strictly at what we allocated (6000)
    const manualObject = `${objHeader}\n<< /Type /Metadata /Subtype /XML /Length 6000 >>\nstream\n${trimmedXmp}`;
    
    resultBuffer.write(manualObject, objIndex, 'latin1');
    
    // We must put 'endstream' and 'endobj' at the original boundary 
    // to keep the file length identical for the XREF table
    resultBuffer.write(`\nendstream\nendobj`, endObjIndex - 18, 'latin1');

    console.log(`💉 v77: Block-level reconstruction of Object ${objNum}.`);
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
