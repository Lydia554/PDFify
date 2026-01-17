const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, PDFName, PDFHexString, PDFString } = require("pdf-lib");
const generateZugferdXml = require("../../xml/generateZugferdXml");

function patchPdfBuffer(pdfBuffer, metadataTag, structTreeTag, xmpString) {
    const resultBuffer = Buffer.from(pdfBuffer);
    const pdfString = pdfBuffer.toString('latin1');

    // --- STEP 1: FIND AND SANITIZE THE CATALOG OBJECT ---
    // We search for the actual Catalog dictionary to remove any hidden Metadata links
    const catalogMatch = pdfString.match(/(\d+ \d+ obj)\s*<<[^>]*\/Type\s*\/Catalog/);
    if (catalogMatch) {
        const catalogStart = catalogMatch.index;
        const catalogEnd = pdfString.indexOf('>>', catalogStart);
        
        // Find if there is a /Metadata key already there
        const metaKeySearch = /\/Metadata\s+\d+\s+\d+\s+R/g;
        let match;
        const catalogPart = pdfString.slice(catalogStart, catalogEnd);
        
        // Overwrite any /Metadata key with spaces in the buffer
        if (catalogPart.includes('/Metadata')) {
            const metaIndex = catalogPart.indexOf('/Metadata');
            const absoluteMetaPos = catalogStart + metaIndex;
            // We turn /Metadata into /OldMeta to kill the link
            resultBuffer.write("/OldMeta ", absoluteMetaPos, 'latin1');
        }
    }

    // --- STEP 2: THE SPACER HIJACK ---
    const spacerRegex = /\/PDFify\s*<([0-9a-fA-F]{100,})>/;
    const spacerMatch = pdfString.match(spacerRegex);
    if (!spacerMatch) return pdfBuffer;

    const fileSpecMatch = pdfString.match(/(\d+ \d+ obj)\s*<<[^>]*\/F\s*\(factur-x\.xml\)/);
    let afArray = fileSpecMatch ? `/AF [${fileSpecMatch[1].replace(' obj', ' R')}]` : "";

    // Inject our valid link
    const injection = `/Metadata ${metadataTag} /StructTreeRoot ${structTreeTag} ${afArray} /MarkInfo<< /Marked true >>`;
    const paddedInjection = injection.padEnd(spacerMatch[0].length, ' ');
    resultBuffer.write(paddedInjection, spacerMatch.index, 'latin1');

    // --- STEP 3: STREAM SURGERY ---
    const objHeader = `${metadataTag.replace(' R', '')} obj`;
    const objIndex = pdfString.indexOf(objHeader);
    const streamStart = pdfString.indexOf('stream', objIndex);
    const dictStart = pdfString.lastIndexOf('<<', streamStart);
    
    // Explicitly set /Type/Metadata and /Subtype/XML
    resultBuffer.fill(0x20, dictStart, streamStart); 
    resultBuffer.write(`<< /Type /Metadata /Subtype /XML /Length 6000 >>`, dictStart, 'latin1');

    let dataStart = streamStart + 6;
    if (pdfBuffer[dataStart] === 0x0D) dataStart++; 
    if (pdfBuffer[dataStart] === 0x0A) dataStart++; 

    const endstreamPos = pdfString.indexOf('endstream', dataStart);
    resultBuffer.fill(0x20, dataStart, endstreamPos);
    resultBuffer[endstreamPos - 1] = 0x0A; // Required EOL

    const xmpBytes = Buffer.from(xmpString, 'utf8');
    xmpBytes.copy(resultBuffer, dataStart);

    console.log(`💉 v59: Post-processor applied. Catalog Sanitized. Target: ${metadataTag}`);
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
    
    // 1. Metadata Stream
    const metadataStream = pdfDoc.context.stream(Buffer.alloc(6000, 0x20), { 
        Length: 6000,
        Padding: " ".repeat(200) 
    });
    const metadataRef = pdfDoc.context.register(metadataStream);
    const structTreeRef = pdfDoc.context.register(pdfDoc.context.obj({ Type: PDFName.of('StructTreeRoot') }));

    // 2. The ONLY Link Spacer
    pdfDoc.catalog.set(PDFName.of('PDFify'), PDFHexString.fromText(" ".repeat(500)));
    
    // Ensure pdf-lib hasn't snuck a Metadata key into the Catalog
    pdfDoc.catalog.delete(PDFName.of('Metadata'));
    pdfDoc.catalog.delete(PDFName.of('Keywords'));

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