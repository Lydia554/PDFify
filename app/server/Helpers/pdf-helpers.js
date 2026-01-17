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
    pdfDoc.catalog.set(PDFName.of("OutputIntents"), pdfDoc.context.obj([
        {
            Type: PDFName.of("OutputIntent"), S: PDFName.of("GTS_PDFA1"),
            OutputConditionIdentifier: PDFHexString.fromText("sRGB IEC61966-2.1"),
            Info: PDFHexString.fromText("sRGB IEC61966-2.1"), DestOutputProfile: iccRef,
        }
    ]));

    // 2. PRE-ALLOCATE A 6000 BYTE STREAM (The Landing Zone)
    // This ensures endPos - startPos is large enough for the surgery
    const dummyRef = pdfDoc.context.register(
        pdfDoc.context.stream(Buffer.alloc(6000, 0x20), { Length: 6000 })
    );
    pdfDoc.catalog.set(PDFName.of('Metadata'), dummyRef);

    // 3. Attach XML & Structure
    await pdfDoc.attach(Buffer.from(generateZugferdXml(invoiceData), "utf8"), 'factur-x.xml', {
        mimeType: "application/xml", 
        afRelationship: "Alternative",
    });
    pdfDoc.catalog.set(PDFName.of('MarkInfo'), pdfDoc.context.obj({ Marked: true }));
    const structTreeRef = pdfDoc.context.register(pdfDoc.context.obj({ Type: PDFName.of('StructTreeRoot') }));
    pdfDoc.catalog.set(PDFName.of('StructTreeRoot'), structTreeRef);

    // 4. Save
    const pdfBytes = await pdfDoc.save({ useObjectStreams: false, addDefaultMetadata: false });
    const xmpString = generatePdfA3bXmp(invoiceData, `uuid:${id1.toLowerCase()}`, `uuid:${id2.toLowerCase()}`);
    
    return patchPdfBuffer(Buffer.from(pdfBytes), dummyRef.tag, xmpString);
}

function patchPdfBuffer(pdfBuffer, dummyTag, xmpString) {
    const pdfString = pdfBuffer.toString('latin1');
    const resultBuffer = Buffer.from(pdfBuffer);

    const objNum = dummyTag.split(' ')[0];
    const targetHeader = `${objNum} 0 obj`;
    const startPos = pdfString.indexOf(targetHeader);
    const endPos = pdfString.indexOf('endobj', startPos) + 6;

    if (startPos === -1) return pdfBuffer;

    // Wipe the entire pre-allocated block with spaces
    resultBuffer.fill(0x20, startPos, endPos);

    // Build perfect Metadata block
    const xmp = xmpString.trim();
    // Use \n (0x0A) strictly for Clause 6.1.9 compliance
    const streamContent = `${targetHeader}\n<< /Type /Metadata /Subtype /XML /Length ${xmp.length} >>\nstream\n${xmp}\nendstream\nendobj`;
    
    // Write into the wiped area
    resultBuffer.write(streamContent, startPos, 'latin1');

    console.log(`💉 v82: Large-Block Surgery on Object ${objNum}. Total space: ${endPos - startPos} bytes.`);
    return resultBuffer;
}

function generatePdfA3bXmp(invoiceData, documentId, instanceId) {
    const now = new Date().toISOString().split('.')[0] + 'Z';
    return `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"><pdfaid:part>3</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance></rdf:Description><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:format>application/pdf</dc:format><dc:title><rdf:Alt><rdf:li xml:lang="x-default">Invoice ${invoiceData.orderId || 'Unknown'}</rdf:li></rdf:Alt></dc:title></rdf:Description><rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/"><xmp:CreateDate>${now}</xmp:CreateDate><xmp:ModifyDate>${now}</xmp:ModifyDate></rdf:Description><rdf:Description rdf:about="" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/"><xmpMM:DocumentID>${documentId}</xmpMM:DocumentID><xmpMM:InstanceID>${instanceId}</xmpMM:InstanceID></rdf:Description><rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#"><fx:ConformanceLevel>COMFORT</fx:ConformanceLevel><fx:DocumentFileName>factur-x.xml</fx:DocumentFileName><fx:DocumentType>INVOICE</fx:DocumentType><fx:Version>1.0</fx:Version></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
}

module.exports = { finalizePdf };