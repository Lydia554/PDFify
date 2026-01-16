const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, PDFName, PDFHexString, PDFString } = require("pdf-lib");
const generateZugferdXml = require("../../xml/generateZugferdXml");

/**
 * THE TOTAL ECLIPSE HIJACKER (v44)
 */
function patchPdfBuffer(pdfBuffer, xmpString) {
    // 1. Convert to string to perform global sanitization
    let pdfString = pdfBuffer.toString('latin1');
    
    // 2. KILL ALL GHOSTS: Rename every instance of "/Metadata" to "/OldMeta"
    // This ensures no conflicting metadata objects exist.
    pdfString = pdfString.replace(/\/Metadata/g, '/OldMeta');

    // 3. FIND OUR TARGET: The object we created with Length 6000
    const metadataRegex = /(\d+ \d+ obj)\s*<<[^>]*\/Length\s+6000[^>]*>>\s*stream/i;
    const match = pdfString.match(metadataRegex);
    
    if (!match) {
        console.error("❌ Critical: Metadata container not found.");
        return pdfBuffer;
    }

    const objHeaderStart = match.index;
    const streamMarkerIndex = pdfString.indexOf('stream', objHeaderStart);
    const actualEndstreamPos = pdfString.indexOf('endstream', streamMarkerIndex);
    const dataEnd = actualEndstreamPos;
    const dataStart = dataEnd - 6000;

    let resultBuffer = Buffer.from(pdfString, 'latin1');

    // 4. HEADER SURGERY: Make this object the OFFICIAL Metadata object
    // We inject /Type /Metadata /Subtype /XML
    const newHeader = `${match[1]} << /Type /Metadata /Subtype /XML /Length 6000 >>`.padEnd(streamMarkerIndex - objHeaderStart, ' ');
    resultBuffer.write(newHeader, objHeaderStart, 'latin1');

    // 5. DATA SURGERY: Inject XMP and mandatory EOL
    resultBuffer.fill(0x20, dataStart, dataEnd);
    resultBuffer[dataEnd - 1] = 0x0A; 
    const xmpBytes = Buffer.from(xmpString, 'utf8');
    xmpBytes.copy(resultBuffer, dataStart);

    // 6. CATALOG LINK: Rename our /Keywords anchor to /Metadata
    const keywordMatch = pdfString.match(/\/Keywords\s+(\d+ \d+ R)/);
    if (keywordMatch) {
        resultBuffer.write("/Metadata", keywordMatch.index, 'latin1');
    }

    console.log("💉 PDF/A-3b Total Eclipse Hijack (v44) complete.");
    return resultBuffer;
}

function generatePdfA3bXmp(invoiceData, documentId, instanceId) {
    const now = new Date().toISOString().split('.')[0] + 'Z'; 
    return [
        '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>',
        '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
        '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
        '<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">',
        '<pdfaid:part>3</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance>',
        '</rdf:Description>',
        '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">',
        '<dc:format>application/pdf</dc:format>',
        `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">Invoice ${invoiceData.orderId || ''}</rdf:li></rdf:Alt></dc:title>`,
        '</rdf:Description>',
        '<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">',
        `<xmp:CreateDate>${now}</xmp:CreateDate><xmp:ModifyDate>${now}</xmp:ModifyDate>`, 
        '</rdf:Description>',
        '<rdf:Description rdf:about="" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/">',
        `<xmpMM:DocumentID>${documentId}</xmpMM:DocumentID><xmpMM:InstanceID>${instanceId}</xmpMM:InstanceID>`, 
        '</rdf:Description>',
        '<rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">',
        '<fx:ConformanceLevel>COMFORT</fx:ConformanceLevel>',
        '<fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>',
        '<fx:DocumentType>INVOICE</fx:DocumentType>',
        '<fx:Version>1.0</fx:Version>',
        '</rdf:Description>',
        '</rdf:RDF></x:xmpmeta>',
        '<?xpacket end="w"?>'
    ].join('\n');
}

async function finalizePdf(pdfDoc, invoiceData) {
    const id1 = crypto.randomBytes(16).toString('hex').toUpperCase();
    const id2 = crypto.randomBytes(16).toString('hex').toUpperCase();
    pdfDoc.context.trailerInfo.ID = pdfDoc.context.obj([PDFHexString.of(id1), PDFHexString.of(id2)]);

    const iccProfilePath = path.join(__dirname, "sRGB2014.icc");
    const iccRef = pdfDoc.context.register(pdfDoc.context.stream(fs.readFileSync(iccProfilePath), { N: 3 }));
    pdfDoc.catalog.set(PDFName.of("OutputIntents"), pdfDoc.context.obj([{ 
        Type: PDFName.of("OutputIntent"), S: PDFName.of("GTS_PDFA1"),
        OutputConditionIdentifier: PDFHexString.fromText("sRGB IEC61966-2.1"),
        Info: PDFHexString.fromText("sRGB IEC61966-2.1"), DestOutputProfile: iccRef,
    }]));

    // 1. Create a stream with Length 6000
    const metadataStream = pdfDoc.context.stream(Buffer.alloc(6000, 0x20), { Length: 6000 });
    const metadataRef = pdfDoc.context.register(metadataStream);

    // 2. The Anchor
    pdfDoc.catalog.set(PDFName.of('Keywords'), metadataRef);
    
    pdfDoc.catalog.set(PDFName.of('MarkInfo'), pdfDoc.context.obj({ Marked: true }));
    const structTreeRef = pdfDoc.context.register(pdfDoc.context.obj({ Type: PDFName.of('StructTreeRoot') }));
    pdfDoc.catalog.set(PDFName.of('StructTreeRoot'), structTreeRef);

    await pdfDoc.attach(Buffer.from(generateZugferdXml(invoiceData), "utf8"), 'factur-x.xml', {
        mimeType: "application/xml", afRelationship: "Alternative"
    });

    const pdfBytes = await pdfDoc.save({ useObjectStreams: false, addDefaultMetadata: false });
    const xmpString = generatePdfA3bXmp(invoiceData, `uuid:${id1.toLowerCase()}`, `uuid:${id2.toLowerCase()}`);
    
    return patchPdfBuffer(Buffer.from(pdfBytes), xmpString);
}

module.exports = { finalizePdf };
