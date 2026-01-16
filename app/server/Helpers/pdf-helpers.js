const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, PDFName, PDFHexString, PDFString } = require("pdf-lib");
const generateZugferdXml = require("../../xml/generateZugferdXml");

/**
 * THE DETERMINISTIC HIJACKER (v36)
 * Instead of searching for a ghost, we find the specific object we registered.
 */
function patchPdfBuffer(pdfBuffer, metadataTag, xmpString) {
    const pdfString = pdfBuffer.toString('latin1');
    
    // 1. Find the object by its ID (e.g., "12 0 obj")
    // We look for the start of the stream inside that specific object
    const objectHeader = `${metadataTag.replace(' R', '')} obj`;
    const objIndex = pdfString.indexOf(objectHeader);
    
    if (objIndex === -1) {
        console.error(`❌ Critical: Metadata Object ${objectHeader} not found in buffer.`);
        return pdfBuffer;
    }

    const streamStartIndex = pdfString.indexOf('stream', objIndex) + 6;
    let contentStart = streamStartIndex;
    if (pdfBuffer[contentStart] === 0x0D) contentStart++; 
    if (pdfBuffer[contentStart] === 0x0A) contentStart++; 

    const endStreamIndex = pdfString.indexOf('endstream', contentStart);
    const originalLength = endStreamIndex - contentStart;

    const xmpBytes = Buffer.from(xmpString, 'utf8');
    const resultBuffer = Buffer.from(pdfBuffer);
    
    // 2. Overwrite Content
    resultBuffer.fill(0x20, contentStart, endStreamIndex);
    xmpBytes.copy(resultBuffer, contentStart);

    // 3. WIPE THE FILTER & ADD METADATA TAGS
    // We find the dictionary for this object and inject /Type/Metadata
    // And remove /Filter/FlateDecode
    const dictStart = pdfString.lastIndexOf('<<', contentStart);
    const dictEnd = pdfString.indexOf('>>', dictStart);
    const dictText = pdfString.slice(dictStart, dictEnd);

    if (dictText.includes('/Filter')) {
        const filterMatch = dictText.match(/\/Filter\s*\/FlateDecode/);
        if (filterMatch) {
            const filterPos = dictStart + filterMatch.index;
            resultBuffer.write(" ".repeat(filterMatch[0].length), filterPos, 'latin1');
        }
    }

    // 4. CATALOG LINKING (The Final Move)
    // We find where we hid '/ZF' in the Catalog and change it to '/Metadata'
    const catalogMatch = pdfString.match(/\/ZF\s+(\d+ \d+ R)/);
    if (catalogMatch) {
        const zfPos = catalogMatch.index;
        resultBuffer.write("/Metadata", zfPos, 'latin1');
    }

    console.log("💉 PDF/A-3b Deterministic Hijack Complete.");
    return resultBuffer;
}

function generatePdfA3bXmp(invoiceData, documentId, instanceId) {
    const now = new Date().toISOString().split('.')[0] + 'Z'; 
    const padding = " ".repeat(3000);
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
        padding,
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

    // 1. Create the Metadata Stream manually (Very large so we can overwrite)
    const metadataStream = pdfDoc.context.stream(Buffer.alloc(6000, 0x20), {
        Type: PDFName.of('Metadata'),
        Subtype: PDFName.of('XML'),
    });
    const metadataRef = pdfDoc.context.register(metadataStream);

    // 2. Hide it in the Catalog under a name pdf-lib won't delete immediately
    pdfDoc.catalog.set(PDFName.of('ZF'), metadataRef);
    
    // 3. Mark Info and StructTree
    pdfDoc.catalog.set(PDFName.of('MarkInfo'), pdfDoc.context.obj({ Marked: true }));
    const structTreeRef = pdfDoc.context.register(pdfDoc.context.obj({ Type: PDFName.of('StructTreeRoot') }));
    pdfDoc.catalog.set(PDFName.of('StructTreeRoot'), structTreeRef);

    await pdfDoc.attach(Buffer.from(generateZugferdXml(invoiceData), "utf8"), 'factur-x.xml', {
        mimeType: "application/xml", afRelationship: "Alternative"
    });

    const pdfBytes = await pdfDoc.save({ useObjectStreams: false, addDefaultMetadata: false });
    
    const xmpString = generatePdfA3bXmp(invoiceData, `uuid:${id1.toLowerCase()}`, `uuid:${id2.toLowerCase()}`);
    
    // We pass the Tag so the patcher knows EXACTLY which object to look for
    return patchPdfBuffer(Buffer.from(pdfBytes), metadataRef.tag, xmpString);
}

module.exports = { finalizePdf };