const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, PDFName, PDFHexString, PDFRawStream } = require("pdf-lib");
const generateZugferdXml = require("../../xml/generateZugferdXml");

async function finalizePdf(pdfDoc, invoiceData) {
    const id1 = crypto.randomBytes(16).toString('hex').toUpperCase();
    const id2 = crypto.randomBytes(16).toString('hex').toUpperCase();
    pdfDoc.context.trailerInfo.ID = pdfDoc.context.obj([PDFHexString.of(id1), PDFHexString.of(id2)]);

    // 1. Standard OutputIntent (ICC)
    const iccProfilePath = path.join(__dirname, "sRGB2014.icc");
    const iccRef = pdfDoc.context.register(pdfDoc.context.stream(fs.readFileSync(iccProfilePath), { N: 3 }));
    pdfDoc.catalog.set(PDFName.of("OutputIntents"), pdfDoc.context.obj([{
        Type: PDFName.of("OutputIntent"), S: PDFName.of("GTS_PDFA1"),
        OutputConditionIdentifier: PDFHexString.fromText("sRGB IEC61966-2.1"),
        Info: PDFHexString.fromText("sRGB IEC61966-2.1"), DestOutputProfile: iccRef,
    }]));

    // 2. Attach XML
    await pdfDoc.attach(Buffer.from(generateZugferdXml(invoiceData), "utf8"), 'factur-x.xml', {
        mimeType: "application/xml", 
        afRelationship: "Alternative",
    });

    // 3. Create a Placeholder for Metadata in the Catalog
    // We use a high object number that likely doesn't exist yet (e.g., 999 0 R)
    // Actually, we'll let pdf-lib create a dummy object so the XREF is stable
    const dummyRef = pdfDoc.context.register(pdfDoc.context.obj({ DUMMY: 'MARKER' }));
    pdfDoc.catalog.set(PDFName.of('Metadata'), dummyRef);
    
    // Tagging
    pdfDoc.catalog.set(PDFName.of('MarkInfo'), pdfDoc.context.obj({ Marked: true }));
    const structTreeRef = pdfDoc.context.register(pdfDoc.context.obj({ Type: PDFName.of('StructTreeRoot') }));
    pdfDoc.catalog.set(PDFName.of('StructTreeRoot'), structTreeRef);

    // 4. Save
    const pdfBytes = await pdfDoc.save({ useObjectStreams: false, addDefaultMetadata: false });
    
    // 5. SURGERY: Find the dummy object and overwrite it with a REAL Metadata stream
    const xmpString = generatePdfA3bXmp(invoiceData, `uuid:${id1.toLowerCase()}`, `uuid:${id2.toLowerCase()}`);
    return patchPdfBuffer(Buffer.from(pdfBytes), dummyRef.tag, xmpString);
}

function patchPdfBuffer(pdfBuffer, dummyTag, xmpString) {
    const pdfString = pdfBuffer.toString('latin1');
    const resultBuffer = Buffer.from(pdfBuffer);

    // Find the dummy object (e.g. "8 0 obj")
    const objNum = dummyTag.split(' ')[0];
    const targetHeader = `${objNum} 0 obj`;
    const startPos = pdfString.indexOf(targetHeader);
    const endPos = pdfString.indexOf('endobj', startPos) + 6;

    if (startPos === -1) return pdfBuffer;

    // Build the Real Metadata Stream Object
    // It must fit exactly or be smaller than the space we occupy
    // We pad the end with spaces to ensure we don't change the file size
    const xmp = xmpString.trim();
    const streamContent = `\n<< /Type /Metadata /Subtype /XML /Length ${xmp.length} >>\nstream\n${xmp}\nendstream\nendobj`;
    
    const originalLength = endPos - startPos;
    
    // Wipe original
    resultBuffer.fill(0x20, startPos, endPos);
    
    // Write new (if it fits)
    if (streamContent.length <= originalLength) {
        resultBuffer.write(streamContent, startPos, 'latin1');
    } else {
        // If it doesn't fit, we have to use the "v80" method of pre-allocating a 6000 byte stream
        console.error("XMP too large for dummy object. Structural failure imminent.");
    }

    console.log(`💉 v81: Targeted Object Overwrite (${objNum} 0 obj)`);
    return resultBuffer;
}

function generatePdfA3bXmp(invoiceData, documentId, instanceId) {
    const now = new Date().toISOString().split('.')[0] + 'Z';
    return `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"><pdfaid:part>3</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance></rdf:Description><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:format>application/pdf</dc:format><dc:title><rdf:Alt><rdf:li xml:lang="x-default">Invoice ${invoiceData.orderId || 'Unknown'}</rdf:li></rdf:Alt></dc:title></rdf:Description><rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/"><xmp:CreateDate>${now}</xmp:CreateDate><xmp:ModifyDate>${now}</xmp:ModifyDate></rdf:Description><rdf:Description rdf:about="" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/"><xmpMM:DocumentID>${documentId}</xmpMM:DocumentID><xmpMM:InstanceID>${instanceId}</xmpMM:InstanceID></rdf:Description><rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#"><fx:ConformanceLevel>COMFORT</fx:ConformanceLevel><fx:DocumentFileName>factur-x.xml</fx:DocumentFileName><fx:DocumentType>INVOICE</fx:DocumentType><fx:Version>1.0</fx:Version></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
}

module.exports = { finalizePdf };
