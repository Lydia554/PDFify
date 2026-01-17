const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, PDFName, PDFHexString } = require("pdf-lib");
const generateZugferdXml = require("../../xml/generateZugferdXml");

async function finalizePdf(pdfDoc, invoiceData) {
    const id1 = crypto.randomBytes(16).toString('hex').toUpperCase();
    const id2 = crypto.randomBytes(16).toString('hex').toUpperCase();
    pdfDoc.context.trailerInfo.ID = pdfDoc.context.obj([PDFHexString.of(id1), PDFHexString.of(id2)]);

    // 1. Setup OutputIntent
    const iccProfilePath = path.join(__dirname, "sRGB2014.icc");
    const iccRef = pdfDoc.context.register(pdfDoc.context.stream(fs.readFileSync(iccProfilePath), { N: 3 }));
    pdfDoc.catalog.set(PDFName.of("OutputIntents"), pdfDoc.context.obj([
        {
            Type: PDFName.of("OutputIntent"), S: PDFName.of("GTS_PDFA1"),
            OutputConditionIdentifier: PDFHexString.fromText("sRGB IEC61966-2.1"),
            Info: PDFHexString.fromText("sRGB IEC61966-2.1"), DestOutputProfile: iccRef,
        }
    ]));

    // 2. Add ZUGFeRD Attachment
    await pdfDoc.attach(Buffer.from(generateZugferdXml(invoiceData), "utf8"), 'factur-x.xml', {
        mimeType: "application/xml", 
        afRelationship: "Alternative",
    });

    // 3. Setup a "Placeholder" in the Catalog
    // We create a custom key that we can find later to swap for /Metadata
    pdfDoc.catalog.set(PDFName.of('METADATA_LINK'), PDFHexString.fromText("9999 0 R"));
    pdfDoc.catalog.set(PDFName.of('MarkInfo'), pdfDoc.context.obj({ Marked: true }));
    const structTreeRef = pdfDoc.context.register(pdfDoc.context.obj({ Type: PDFName.of('StructTreeRoot') }));
    pdfDoc.catalog.set(PDFName.of('StructTreeRoot'), structTreeRef);

    // 4. Save (Crucial: No Object Streams)
    const pdfBytes = await pdfDoc.save({ useObjectStreams: false, addDefaultMetadata: false });
    const xmpString = generatePdfA3bXmp(invoiceData, `uuid:${id1.toLowerCase()}`, `uuid:${id2.toLowerCase()}`);
    
    return patchPdfBuffer(Buffer.from(pdfBytes), xmpString);
}

function patchPdfBuffer(pdfBuffer, xmpString) {
    let pdfString = pdfBuffer.toString('latin1');
    
    // 1. Find the Catalog
    const catalogMatch = pdfString.match(/(\d+ \d+ obj)\s*<<[^>]*\/Type\s*\/Catalog/);
    if (!catalogMatch) return pdfBuffer;

    // 2. Identify a New Object ID (Last Object ID + 1)
    const allObjs = pdfString.match(/(\d+) 0 obj/g);
    const lastId = Math.max(...allObjs.map(o => parseInt(o.split(' ')[0])));
    const newId = lastId + 1;

    // 3. Inject the link into the Catalog
    // We find our placeholder METADATA_LINK and rename it to /Metadata
    const placeholder = "/METADATA_LINK <" + Buffer.from("9999 0 R").toString('hex').toUpperCase() + ">";
    const realLink = ("/Metadata " + newId + " 0 R").padEnd(placeholder.length, ' ');
    
    let patchedBuffer = Buffer.from(pdfBuffer);
    const placeholderPos = pdfString.indexOf(placeholder);
    if (placeholderPos !== -1) {
        patchedBuffer.write(realLink, placeholderPos, 'latin1');
    }

    // 4. Create the New Metadata Object
    const xmp = xmpString.trim();
    const newObject = `\n${newId} 0 obj\n<< /Type /Metadata /Subtype /XML /Length ${xmp.length} >>\nstream\n${xmp}\nendstream\nendobj\n`;
    
    // 5. Append to the end of the file (Incremental Update style)
    // This is valid PDF structure and bypasses all library bugs!
    const finalBuffer = Buffer.concat([patchedBuffer, Buffer.from(newObject, 'latin1')]);

    console.log(`\ud83d\udc8e v84: Pure Node.js Incremental Injection. New Metadata Object: ${newId}`);
    return finalBuffer;
}

function generatePdfA3bXmp(invoiceData, documentId, instanceId) {
    const now = new Date().toISOString().split('.')[0] + 'Z';
    return `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"><pdfaid:part>3</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance></rdf:Description><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:format>application/pdf</dc:format><dc:title><rdf:Alt><rdf:li xml:lang="x-default">Invoice ${invoiceData.orderId || 'Unknown'}</rdf:li></rdf:Alt></dc:title></rdf:Description><rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/"><xmp:CreateDate>${now}</xmp:CreateDate><xmp:ModifyDate>${now}</xmp:ModifyDate></rdf:Description><rdf:Description rdf:about="" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/"><xmpMM:DocumentID>${documentId}</xmpMM:DocumentID><xmpMM:InstanceID>${instanceId}</xmpMM:InstanceID></rdf:Description><rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#"><fx:ConformanceLevel>COMFORT</fx:ConformanceLevel><fx:DocumentFileName>factur-x.xml</fx:DocumentFileName><fx:DocumentType>INVOICE</fx:DocumentType><fx:Version>1.0</fx:Version></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
}

module.exports = { finalizePdf };