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

    // 1. NEUTRALIZE THE CATALOG (Remove all existing Metadata pointers)
    const catalogMatch = pdfString.match(/(\d+ \d+ obj)\s*<<[^>]*\/Type\s*\/Catalog/);
    if (catalogMatch) {
        const catalogStart = catalogMatch.index;
        const catalogEnd = pdfString.indexOf('>>', catalogStart);
        const metaRegex = /\/Metadata\s+\d+\s+\d+\s+R/g;
        let m;
        const catalogContent = pdfString.slice(catalogStart, catalogEnd);
        while ((m = metaRegex.exec(catalogContent)) !== null) {
            resultBuffer.fill(0x20, catalogStart + m.index, catalogStart + m.index + m[0].length);
        }
    }

    // 2. HIJACK THE SPACER (Inject our Metadata, AF, and StructTree)
    const spacerRegex = /\/PDFify\s*<([0-9a-fA-F]{100,})>/;
    const spacerMatch = pdfString.match(spacerRegex);
    if (spacerMatch) {
        const fileSpecMatch = pdfString.match(/(\d+ \d+ obj)\s*<<[^>]*\/F\s*\(factur-x\.xml\)/);
        const afArray = fileSpecMatch ? `/AF [${fileSpecMatch[1].replace(' obj', ' R')}]` : "";
        const injection = `/Metadata ${metadataTag} /StructTreeRoot ${structTreeTag} ${afArray} /MarkInfo<</Marked true>>`;
        const paddedInjection = injection.padEnd(spacerMatch[0].length, ' ');
        resultBuffer.write(paddedInjection, spacerMatch.index, 'latin1');
    }

    // 3. THE METADATA OBJECT SURGERY
    const objHeader = `${metadataTag.replace(' R', '')} obj`;
    const objIndex = pdfString.indexOf(objHeader);
    const streamMarker = pdfString.indexOf('stream', objIndex);
    const dictStart = pdfString.lastIndexOf('<<', streamMarker);
    
    // Wipe and write the mandatory dictionary
    resultBuffer.fill(0x20, dictStart, streamMarker);
    resultBuffer.write(`<< /Type /Metadata /Subtype /XML /Length 6000 >>\n`, dictStart, 'latin1');

    // 4. THE "CONSTANT 3" KILLER: FIND BYTE ZERO
    // We walk through the bytes to find exactly where the stream data begins
    let dataStart = streamMarker + 6; // length of 'stream'
    // Standard PDF EOLs: \n (10) or \r\n (13 10)
    if (pdfBuffer[dataStart] === 0x0D && pdfBuffer[dataStart+1] === 0x0A) {
        dataStart += 2;
    } else if (pdfBuffer[dataStart] === 0x0A) {
        dataStart += 1;
    }

    const endstreamPos = pdfString.indexOf('endstream', dataStart);
    
    // WIPE THE ENTIRE BUCKET WITH NULLS (0x00) - Much safer than spaces
    resultBuffer.fill(0x00, dataStart, endstreamPos);
    
    // Mandatory EOL right before 'endstream'
    resultBuffer[endstreamPos - 1] = 0x0A; 

    // WRITE THE XMP AT THE ABSOLUTE START
    const xmpBytes = Buffer.from(xmpString.trim(), 'utf8');
    xmpBytes.copy(resultBuffer, dataStart);

    console.log(`💉 v69: Absolute Zero Calibration. Data start: ${dataStart}`);
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

