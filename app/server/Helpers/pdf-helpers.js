const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, PDFName, PDFHexString } = require("pdf-lib");
const generateZugferdXml = require("../../xml/generateZugferdXml");

function patchPdfBuffer(pdfBuffer, xmpString) {
    const pdfString = pdfBuffer.toString('latin1');
    const resultBuffer = Buffer.from(pdfBuffer);

    // 1. FIND THE MARKER OBJECT
    // We search for our unique "METADATA_MARKER" to find the exact object
    const markerIndex = pdfString.indexOf('METADATA_MARKER');
    if (markerIndex === -1) return pdfBuffer;

    // Find the object header (e.g., "9 0 obj") and the stream start
    const objStartIndex = pdfString.lastIndexOf('obj', markerIndex);
    const streamStartIndex = pdfString.indexOf('stream', objStartIndex);
    const dictStartIndex = pdfString.lastIndexOf('<<', streamStartIndex);

    // 2. SURGICAL DICTIONARY FIX
    // We rewrite the dictionary to be exactly compliant
    const cleanDict = `<< /Type /Metadata /Subtype /XML /Length 6000 >>`.padEnd(streamStartIndex - dictStartIndex - 2, ' ');
    resultBuffer.write(cleanDict, dictStartIndex + 2, 'latin1');

    // 3. DATA ALIGNMENT
    // Calculate the exact byte after 'stream' + EOL
    let dataStart = streamStartIndex + 6;
    if (pdfBuffer[dataStart] === 0x0D) dataStart++; // \r
    if (pdfBuffer[dataStart] === 0x0A) dataStart++; // \n

    const endStreamIndex = pdfString.indexOf('endstream', dataStart);
    
    // Wipe the entire pre-allocated 6000 bytes with spaces (0x20)
    resultBuffer.fill(0x20, dataStart, endStreamIndex);
    
    // Inject the XMP starting exactly at dataStart
    const xmpBytes = Buffer.from(xmpString.trim(), 'utf8');
    xmpBytes.copy(resultBuffer, dataStart);

    // Ensure one mandatory newline before endstream
    resultBuffer[endStreamIndex - 1] = 0x0A;

    console.log("💉 v79: Marker-based injection complete.");
    return resultBuffer;
}

async function finalizePdf(pdfDoc, invoiceData) {
    const id1 = crypto.randomBytes(16).toString('hex').toUpperCase();
    const id2 = crypto.randomBytes(16).toString('hex').toUpperCase();
    pdfDoc.context.trailerInfo.ID = pdfDoc.context.obj([PDFHexString.of(id1), PDFHexString.of(id2)]);

    // 1. OutputIntent (Color Profile)
    const iccProfilePath = path.join(__dirname, "sRGB2014.icc");
    const iccRef = pdfDoc.context.register(pdfDoc.context.stream(fs.readFileSync(iccProfilePath), { N: 3 }));
    pdfDoc.catalog.set(PDFName.of("OutputIntents"), pdfDoc.context.obj([{
        Type: PDFName.of("OutputIntent"), S: PDFName.of("GTS_PDFA1"),
        OutputConditionIdentifier: PDFHexString.fromText("sRGB IEC61966-2.1"),
        Info: PDFHexString.fromText("sRGB IEC61966-2.1"), DestOutputProfile: iccRef,
    }]));

    // 2. PRE-ALLOCATE METADATA WITH A UNIQUE MARKER
    // We fill it with 6000 bytes so the library reserves the space
    const markerBuffer = Buffer.alloc(6000, 0x20);
    markerBuffer.write("METADATA_MARKER", 0, 'utf8');
    const metadataRef = pdfDoc.context.register(pdfDoc.context.stream(markerBuffer, { Length: 6000 }));
    pdfDoc.catalog.set(PDFName.of('Metadata'), metadataRef);

    // 3. Attachment & Structure
    await pdfDoc.attach(Buffer.from(generateZugferdXml(invoiceData), "utf8"), 'factur-x.xml', {
        mimeType: "application/xml", 
        afRelationship: "Alternative",
    });
    pdfDoc.catalog.set(PDFName.of('MarkInfo'), pdfDoc.context.obj({ Marked: true }));
    const structTreeRef = pdfDoc.context.register(pdfDoc.context.obj({ Type: PDFName.of('StructTreeRoot') }));
    pdfDoc.catalog.set(PDFName.of('StructTreeRoot'), structTreeRef);

    // 4. Save and Patch
    const pdfBytes = await pdfDoc.save({ useObjectStreams: false, addDefaultMetadata: false });
    const xmpString = generatePdfA3bXmp(invoiceData, `uuid:${id1.toLowerCase()}`, `uuid:${id2.toLowerCase()}`);
    
    return patchPdfBuffer(Buffer.from(pdfBytes), xmpString);
}

function generatePdfA3bXmp(invoiceData, documentId, instanceId) {
    const now = new Date().toISOString().split('.')[0] + 'Z';
    return `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"><pdfaid:part>3</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance></rdf:Description><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:format>application/pdf</dc:format><dc:title><rdf:Alt><rdf:li xml:lang="x-default">Invoice ${invoiceData.orderId || 'Unknown'}</rdf:li></rdf:Alt></dc:title></rdf:Description><rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/"><xmp:CreateDate>${now}</xmp:CreateDate><xmp:ModifyDate>${now}</xmp:ModifyDate></rdf:Description><rdf:Description rdf:about="" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/"><xmpMM:DocumentID>${documentId}</xmpMM:DocumentID><xmpMM:InstanceID>${instanceId}</xmpMM:InstanceID></rdf:Description><rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#"><fx:ConformanceLevel>COMFORT</fx:ConformanceLevel><fx:DocumentFileName>factur-x.xml</fx:DocumentFileName><fx:DocumentType>INVOICE</fx:DocumentType><fx:Version>1.0</fx:Version></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
}

module.exports = { finalizePdf };
