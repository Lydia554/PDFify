const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, PDFName, PDFHexString } = require("pdf-lib");
const generateZugferdXml = require("../../xml/generateZugferdXml");

function patchPdfBuffer(pdfBuffer, xmpString) {
    // Use Buffer methods directly to avoid encoding corruption
    const marker = Buffer.from("METADATA_MARKER");
    const markerPos = pdfBuffer.indexOf(marker);
    if (markerPos === -1) return pdfBuffer;

    const resultBuffer = Buffer.from(pdfBuffer);

    // 1. Locate the Dictionary and Stream boundaries
    // Look backwards from marker for '<<' and 'stream'
    const streamHeader = Buffer.from("stream");
    const streamPos = pdfBuffer.lastIndexOf(streamHeader, markerPos);
    const dictStart = pdfBuffer.lastIndexOf(Buffer.from("<<"), streamPos);

    // 2. REWRITE DICTIONARY (Ensuring Type/Subtype are present)
    // We pad with spaces to keep the exact original byte length of the dictionary area
    const newDict = `<< /Type /Metadata /Subtype /XML /Length 6000 >>  `;
    const dictSpace = streamPos - dictStart;
    resultBuffer.write(newDict.padEnd(dictSpace, ' '), dictStart, 'latin1');

    // 3. CALIBRATE DATA START
    let dataStart = streamPos + 6; // skip 'stream'
    if (pdfBuffer[dataStart] === 0x0D) dataStart++; // \r
    if (pdfBuffer[dataStart] === 0x0A) dataStart++; // \n

    const endstreamPos = pdfBuffer.indexOf(Buffer.from("endstream"), dataStart);
    
    // 4. WIPE AND INJECT
    resultBuffer.fill(0x20, dataStart, endstreamPos);
    const xmpBytes = Buffer.from(xmpString.trim(), 'utf8');
    xmpBytes.copy(resultBuffer, dataStart);

    // Ensure EOL before endstream for Clause 6.1.9
    resultBuffer[endstreamPos - 1] = 0x0A;

    console.log("💉 v80: Binary-safe Marker injection complete.");
    return resultBuffer;
}

async function finalizePdf(pdfDoc, invoiceData) {
    const id1 = crypto.randomBytes(16).toString('hex').toUpperCase();
    const id2 = crypto.randomBytes(16).toString('hex').toUpperCase();
    pdfDoc.context.trailerInfo.ID = pdfDoc.context.obj([PDFHexString.of(id1), PDFHexString.of(id2)]);

    // Color Space & Output Intent
    const iccProfilePath = path.join(__dirname, "sRGB2014.icc");
    const iccRef = pdfDoc.context.register(pdfDoc.context.stream(fs.readFileSync(iccProfilePath), { N: 3 }));
    pdfDoc.catalog.set(PDFName.of("OutputIntents"), pdfDoc.context.obj([
        {
            Type: PDFName.of("OutputIntent"), S: PDFName.of("GTS_PDFA1"),
            OutputConditionIdentifier: PDFHexString.fromText("sRGB IEC61966-2.1"),
            Info: PDFHexString.fromText("sRGB IEC61966-2.1"), DestOutputProfile: iccRef,
        }
    ]));

    // PRE-ALLOCATE METADATA
    const markerBuffer = Buffer.alloc(6000, 0x20);
    markerBuffer.write("METADATA_MARKER");
    // Register as a raw stream to prevent the library from compressing it
    const metadataRef = pdfDoc.context.register(
        pdfDoc.context.stream(markerBuffer, { Length: 6000 })
    );
    pdfDoc.catalog.set(PDFName.of('Metadata'), metadataRef);

    // Attachment & Tags
    await pdfDoc.attach(Buffer.from(generateZugferdXml(invoiceData), "utf8"), 'factur-x.xml', {
        mimeType: "application/xml", 
        afRelationship: "Alternative",
    });
    pdfDoc.catalog.set(PDFName.of('MarkInfo'), pdfDoc.context.obj({ Marked: true }));
    const structTreeRef = pdfDoc.context.register(pdfDoc.context.obj({ Type: PDFName.of('StructTreeRoot') }));
    pdfDoc.catalog.set(PDFName.of('StructTreeRoot'), structTreeRef);

    // Save with explicit compression OFF for metadata area
    const pdfBytes = await pdfDoc.save({
        useObjectStreams: false, 
        addDefaultMetadata: false 
    });

    const xmpString = generatePdfA3bXmp(invoiceData, `uuid:${id1.toLowerCase()}`, `uuid:${id2.toLowerCase()}`);
    return patchPdfBuffer(Buffer.from(pdfBytes), xmpString);
}

function generatePdfA3bXmp(invoiceData, documentId, instanceId) {
    const now = new Date().toISOString().split('.')[0] + 'Z';
    return `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"><pdfaid:part>3</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance></rdf:Description><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:format>application/pdf</dc:format><dc:title><rdf:Alt><rdf:li xml:lang="x-default">Invoice ${invoiceData.orderId || 'Unknown'}</rdf:li></rdf:Alt></dc:title></rdf:Description><rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/"><xmp:CreateDate>${now}</xmp:CreateDate><xmp:ModifyDate>${now}</xmp:ModifyDate></rdf:Description><rdf:Description rdf:about="" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/"><xmpMM:DocumentID>${documentId}</xmpMM:DocumentID><xmpMM:InstanceID>${instanceId}</xmpMM:InstanceID></rdf:Description><rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#"><fx:ConformanceLevel>COMFORT</fx:ConformanceLevel><fx:DocumentFileName>factur-x.xml</fx:DocumentFileName><fx:DocumentType>INVOICE</fx:DocumentType><fx:Version>1.0</fx:Version></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
}

module.exports = { finalizePdf };