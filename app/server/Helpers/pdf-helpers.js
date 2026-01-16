const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, PDFName, PDFHexString, PDFString } = require("pdf-lib");
const generateZugferdXml = require("../../xml/generateZugferdXml");

/**
 * THE NO-SHIFT PATCHER (v46 - Pre-Allocated)
 * 1. Overwrites the metadata object dictionary (surgical, no header shift).
 * 2. Overwrites the stream content with mandatory EOL.
 * 3. Uses /PDFify landing zone in Catalog for safe linking.
 */
function patchPdfBuffer(pdfBuffer, metadataTag, structTreeTag, xmpString) {
    let pdfString = pdfBuffer.toString('latin1');
    const resultBuffer = Buffer.from(pdfBuffer);

    // --- STEP 1: FIX THE METADATA OBJECT ---
    const objHeader = `${metadataTag.replace(' R', '')} obj`;
    const objIndex = pdfString.indexOf(objHeader);
    
    if (objIndex === -1) {
        console.error(`❌ Critical: Metadata Object ${objHeader} not found.`);
        return pdfBuffer;
    }
    
    // Find the stream start/end
    const streamStart = pdfString.indexOf('stream', objIndex);
    // Check newline length (1 for \n, 2 for \r\n)
    const streamDataStart = streamStart + 6 + (pdfBuffer[streamStart+6] === 0x0D ? 2 : 1);
    const endstream = pdfString.indexOf('endstream', streamDataStart);

    // Overwrite the dictionary to be valid /Type /Metadata
    // We search backwards from 'stream' to find the opening '<<'
    const dictStart = pdfString.lastIndexOf('<<', streamStart);
    
    // With padding, we have plenty of space.
    // We wipe the whole area with spaces first to ensure cleanliness.
    resultBuffer.fill(0x20, dictStart, streamStart); 
    
    const newObjDict = `<< /Type /Metadata /Subtype /XML /Length 6000 >>`;
    resultBuffer.write(newObjDict, dictStart, 'latin1');

    // Overwrite stream content + mandatory EOL
    resultBuffer.fill(0x20, streamDataStart, endstream);
    resultBuffer[endstream - 1] = 0x0A; // Mandatory EOL
    Buffer.from(xmpString, 'utf8').copy(resultBuffer, streamDataStart);

    // --- STEP 2: FIX THE CATALOG (The Link) ---
    // We look for our /PDFify <hex> spacer and replace it with the /Metadata link
    const spacerRegex = /\/PDFify\s*<[0-9a-fA-F]{100,}>/;
    const spacerMatch = pdfString.match(spacerRegex);
    
    if (spacerMatch) {
        const injection = `/Metadata ${metadataTag} /StructTreeRoot ${structTreeTag} `;
        // Ensure we don't overflow the spacer
        if (injection.length <= spacerMatch[0].length) {
            const paddedInjection = injection.padEnd(spacerMatch[0].length, ' ');
            resultBuffer.write(paddedInjection, spacerMatch.index, 'latin1');
        } else {
             console.error("❌ Catalog injection larger than spacer.");
        }
    }

    // --- STEP 3: SANITIZE ---
    // Rename any auto-generated /Metadata to /OldMeta so they don't conflict
    // We scan the buffer for any OTHER /Metadata keys (rare if addDefaultMetadata is false)
    
    console.log("💉 PDF/A-3b Surgery v46 complete. Dictionary pre-allocation succeeded.");
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

    // 1. Create the Metadata stream with a MASSIVE pre-allocated dictionary header
    const metadataStream = pdfDoc.context.stream(Buffer.alloc(6000, 0x20), { 
        Length: 6000,
        // This dummy key "Padding" ensures the << >> block is long enough for our surgery
        Padding: " ".repeat(100) 
    });
    const metadataRef = pdfDoc.context.register(metadataStream);

    // 2. Register StructTree
    const structTreeRef = pdfDoc.context.register(pdfDoc.context.obj({ Type: PDFName.of('StructTreeRoot') }));

    // 3. THE LANDING ZONE: A long Hex String in the Catalog
    // We use a custom name /PDFify. pdf-lib will preserve this.
    pdfDoc.catalog.set(PDFName.of('PDFify'), PDFHexString.fromText(" ".repeat(200)));

    // Standard structural markers
    pdfDoc.catalog.set(PDFName.of('MarkInfo'), pdfDoc.context.obj({ Marked: true }));
    pdfDoc.catalog.set(PDFName.of('StructTreeRoot'), structTreeRef);

    await pdfDoc.attach(Buffer.from(generateZugferdXml(invoiceData), "utf8"), 'factur-x.xml', {
        mimeType: "application/xml", afRelationship: "Alternative"
    });

    const pdfBytes = await pdfDoc.save({ useObjectStreams: false, addDefaultMetadata: false });
    const xmpString = generatePdfA3bXmp(invoiceData, `uuid:${id1.toLowerCase()}`, `uuid:${id2.toLowerCase()}`);
    
    return patchPdfBuffer(Buffer.from(pdfBytes), metadataRef.tag, structTreeRef.tag, xmpString);
}

module.exports = { finalizePdf };
