const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, PDFName, PDFHexString, PDFString } = require("pdf-lib");
const generateZugferdXml = require("../../xml/generateZugferdXml");

/**
 * THE HIJACKER (v33)
 * This function finds the Metadata object and replaces its bytes.
 * It also wipes out the /Filter key so the validator knows it's uncompressed.
 */
function patchPdfBuffer(pdfBuffer, xmpString) {
    const pdfString = pdfBuffer.toString('latin1');
    
    // 1. Find the Metadata object dictionary
    const metadataRegex = /(\d+ \d+ obj)\s*<<[^>]*\/Type\s*\/Metadata[^>]*>>\s*stream/i;
    const match = pdfString.match(metadataRegex);
    
    if (!match) {
        console.error("❌ Critical: Metadata ghost not found.");
        return pdfBuffer;
    }

    const streamStartIndex = pdfString.indexOf('stream', match.index) + 6;
    let contentStart = streamStartIndex;
    // Skip exactly one newline after 'stream'
    if (pdfBuffer[contentStart] === 0x0D) contentStart++; 
    if (pdfBuffer[contentStart] === 0x0A) contentStart++; 

    const endStreamIndex = pdfString.indexOf('endstream', contentStart);
    const originalLength = endStreamIndex - contentStart;

    // 2. Overwrite the Stream Content
    const xmpBytes = Buffer.from(xmpString, 'utf8');
    const resultBuffer = Buffer.from(pdfBuffer);
    
    // Fill the area with spaces, then drop the XMP at the start
    resultBuffer.fill(0x20, contentStart, endStreamIndex);
    xmpBytes.copy(resultBuffer, contentStart);

    // 3. WIPE THE FILTER (The UTF-8 / Encoding Fix)
    // We search for /Filter /FlateDecode within the object header and turn it into spaces
    const headerStart = match.index;
    const headerEnd = streamStartIndex;
    const headerText = pdfString.slice(headerStart, headerEnd);
    
    const filterMatch = headerText.match(/\/Filter\s*\/FlateDecode/);
    if (filterMatch) {
        const globalFilterPos = headerStart + filterMatch.index;
        resultBuffer.write(" ".repeat(filterMatch[0].length), globalFilterPos, 'latin1');
    }

    console.log("💉 PDF/A-3b Compliance Hijack Complete.");
    return resultBuffer;
}

function generatePdfA3bXmp(invoiceData, documentId, instanceId) {
    const now = new Date().toISOString().split('.')[0] + 'Z';
    const orderId = invoiceData.orderId || 'Unknown';
    const padding = " ".repeat(2000);

    // Using an array and joining with \n ensures NO hidden tabs/spaces from your IDE
    return [
        '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>',
        '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
        '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
        '<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">',
        '<pdfaid:part>3</pdfaid:part>',
        '<pdfaid:conformance>B</pdfaid:conformance>',
        '</rdf:Description>',
        '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">',
        '<dc:format>application/pdf</dc:format>',
        `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">Invoice ${orderId}</rdf:li></rdf:Alt></dc:title>`,
        '</rdf:Description>',
        '<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">',
        `<xmp:CreateDate>${now}</xmp:CreateDate>`, 
        `<xmp:ModifyDate>${now}</xmp:ModifyDate>`, 
        '</rdf:Description>',
        '<rdf:Description rdf:about="" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/">',
        `<xmpMM:DocumentID>${documentId}</xmpMM:DocumentID>`, 
        `<xmpMM:InstanceID>${instanceId}</xmpMM:InstanceID>`, 
        '</rdf:Description>',
        '<rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">',
        '<fx:ConformanceLevel>COMFORT</fx:ConformanceLevel>',
        '<fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>',
        '<fx:DocumentType>INVOICE</fx:DocumentType>',
        '<fx:Version>1.0</fx:Version>',
        '</rdf:Description>',
        '</rdf:RDF>',
        '</x:xmpmeta>',
        padding,
        '<?xpacket end="w"?>'
    ].join('\n');
}

async function finalizePdf(pdfDoc, invoiceData) {
    // 1. Trailer & OutputIntents
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

    // 2. Mandatory Structural Tags
    pdfDoc.catalog.set(PDFName.of('MarkInfo'), pdfDoc.context.obj({ Marked: true }));
    pdfDoc.catalog.set(PDFName.of('StructTreeRoot'), pdfDoc.context.register(pdfDoc.context.obj({ Type: PDFName.of('StructTreeRoot') })));

    // 3. THE TROJAN HORSE: Force pdf-lib to create a large metadata object
    // We put 5000 spaces in Keywords. This makes a huge stream we can overwrite.
    pdfDoc.setKeywords([" ".repeat(5000)]); 
    
    const zugferdXml = generateZugferdXml(invoiceData);
    await pdfDoc.attach(Buffer.from(zugferdXml, "utf8"), 'factur-x.xml', {
        mimeType: "application/xml", afRelationship: "Alternative"
    });

    // 4. SAVE (Wait for pdf-lib to finish its work)
    const pdfBytes = await pdfDoc.save({ useObjectStreams: false, addDefaultMetadata: true });
    
    // 5. HIJACK THE RESULT
    const xmpString = generatePdfA3bXmp(invoiceData, `uuid:${id1.toLowerCase()}`, `uuid:${id2.toLowerCase()}`);
    return patchPdfBuffer(Buffer.from(pdfBytes), xmpString);
}

module.exports = { finalizePdf };
