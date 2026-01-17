const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, PDFName, PDFHexString } = require("pdf-lib");
const generateZugferdXml = require("../../xml/generateZugferdXml");

async function finalizePdf(pdfDoc, invoiceData) {
    const id1 = crypto.randomBytes(16).toString('hex').toUpperCase();
    const id2 = crypto.randomBytes(16).toString('hex').toUpperCase();
    pdfDoc.context.trailerInfo.ID = pdfDoc.context.obj([PDFHexString.of(id1), PDFHexString.of(id2)]);

    // 1. EMBED ICC PROFILE
    const iccProfilePath = path.join(__dirname, "sRGB2014.icc");
    const iccBytes = fs.readFileSync(iccProfilePath);
    const iccStream = pdfDoc.context.stream(iccBytes, {
        N: 3,
        Alternate: PDFName.of('DeviceRGB'),
    });
    const iccRef = pdfDoc.context.register(iccStream);

    // 2. SET OUTPUT INTENT (Fixes the 81 DeviceRGB errors)
    const outputIntent = pdfDoc.context.obj({
        Type: PDFName.of('OutputIntent'),
        S: PDFName.of('GTS_PDFA1'),
        OutputConditionIdentifier: PDFHexString.fromText('sRGB IEC61966-2.1'),
        Info: PDFHexString.fromText('sRGB IEC61966-2.1'),
        DestOutputProfile: iccRef,
    });
    pdfDoc.catalog.set(PDFName.of('OutputIntents'), pdfDoc.context.obj([outputIntent]));

    // 3. GENERATE XMP
    const xmpString = generatePdfA3bXmp(invoiceData, `uuid:${id1.toLowerCase()}`, `uuid:${id2.toLowerCase()}`);
    const xmpBytes = Buffer.from(xmpString, 'utf8');

    // 4. CREATE METADATA STREAM (Fixes Clause 6.6.2.1 / Subtypes)
    // We manually set the Type and Subtype keys in the library context
    const metadataStream = pdfDoc.context.stream(xmpBytes, {
        Type: PDFName.of('Metadata'),
        Subtype: PDFName.of('XML'),
    });
    const metadataRef = pdfDoc.context.register(metadataStream);
    pdfDoc.catalog.set(PDFName.of('Metadata'), metadataRef);

    // 5. ATTACH ZUGFERD XML
    const xmlContent = generateZugferdXml(invoiceData);
    await pdfDoc.attach(Buffer.from(xmlContent, 'utf8'), 'factur-x.xml', {
        mimeType: 'application/xml',
        afRelationship: 'Alternative',
    });

    // 6. TAGGING & STRUCTURE
    pdfDoc.catalog.set(PDFName.of('MarkInfo'), pdfDoc.context.obj({ Marked: true }));
    const structTreeRoot = pdfDoc.context.register(pdfDoc.context.obj({ Type: PDFName.of('StructTreeRoot') }));
    pdfDoc.catalog.set(PDFName.of('StructTreeRoot'), structTreeRoot);

    // 7. VIEWER PREFERENCES
    pdfDoc.catalog.set(PDFName.of('ViewerPreferences'), pdfDoc.context.obj({ DisplayDocTitle: true }));

    // 8. FINAL SAVE
    // We let the library handle all byte offsets and Length keys automatically
    return await pdfDoc.save({
        useObjectStreams: false, // Essential for PDF/A
        addDefaultMetadata: false,
    });
}

function generatePdfA3bXmp(invoiceData, documentId, instanceId) {
    const now = new Date().toISOString().split('.')[0] + 'Z';
    // No trailing or leading spaces
    return `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"><pdfaid:part>3</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance></rdf:Description><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:format>application/pdf</dc:format><dc:title><rdf:Alt><rdf:li xml:lang="x-default">Invoice ${invoiceData.orderId || 'Unknown'}</rdf:li></rdf:Alt></dc:title></rdf:Description><rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/"><xmp:CreateDate>${now}</xmp:CreateDate><xmp:ModifyDate>${now}</xmp:ModifyDate></rdf:Description><rdf:Description rdf:about="" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/"><xmpMM:DocumentID>${documentId}</xmpMM:DocumentID><xmpMM:InstanceID>${instanceId}</xmpMM:InstanceID></rdf:Description><rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#"><fx:ConformanceLevel>COMFORT</fx:ConformanceLevel><fx:DocumentFileName>factur-x.xml</fx:DocumentFileName><fx:DocumentType>INVOICE</fx:DocumentType><fx:Version>1.0</fx:Version></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
}

module.exports = { finalizePdf };