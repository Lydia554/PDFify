const fs = require('fs');
const path = require('path');
const PDFKitDocument = require('pdfkit');
const generateZugferdXml = require("../../xml/generateZugferdXml");
const { PDFDocument, PDFName, PDFString, PDFRawStream, PDFBool } = require('pdf-lib');

function logDeepBinary(buffer, label, offset, length = 32) {
    const slice = buffer.slice(offset, offset + length);
    console.log(`\n--- [Deep Log: ${label}] ---`);
    console.log(`Offset: ${offset} | Hex: ${slice.toString('hex').match(/../g).join(' ')}`);
    console.log(`UTF8:   "${slice.toString('utf8').replace(/\r/g, '␍').replace(/\n/g, '␊')}"`);
}

async function generatePdfKitBuffer(invoiceData) {
    return new Promise((resolve) => {
        const doc = new PDFKitDocument({ size: 'A4', margin: 50, colorSpace: 'RGB' });
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));

        const fontPath = path.join(__dirname, '../../templates/fonts/LiberationSans-Regular.ttf');
        doc.font(fontPath);

        let y = 750;

        // Header
        doc.fontSize(20).fillColor([0,0,0]).text(`ZUGFeRD 2.4 INVOICE`, 50, y);
        y -= 40;

        // Order info
        doc.fontSize(12).text(`Order ID: ${invoiceData.orderId}`, 50, y);
        y -= 25;
        doc.text(`Date: ${invoiceData.date}`, 50, y);
        y -= 40;

        // From/To
        doc.fontSize(11).text(`FROM:`, 50, y);
        doc.fontSize(12).text(invoiceData.companyName, 100, y);
        y -= 25;
        doc.fontSize(11).text(`TO:`, 50, y);
        doc.fontSize(12).text(invoiceData.customerName, 100, y);
        y -= 50;

        // Line items header
        doc.fontSize(11).text('Description        Qty      Price      Total', 50, y);
        y -= 25;
        doc.text('---------------------------------------------------', 50, y);
        y -= 25;

        // Line items
        doc.fontSize(10);
        if (invoiceData.items && invoiceData.items.length > 0) {
            invoiceData.items.forEach(item => {
                const total = item.quantity * item.price;
                const totalStr = Number(total).toFixed(2);
                doc.text(`${item.name.padEnd(20)} ${item.quantity}      ${item.price.toFixed(2)}    ${totalStr}`, 50, y);
                y -= 20;
            });
        }

        // Total
        y += 20;
        doc.fontSize(11).text('---------------------------------------------------', 50, y);
        y -= 30;
        doc.fontSize(16).text(`TOTAL: ${Number(invoiceData.total).toFixed(2)} ${invoiceData.currency}`, 300, y);

        doc.end();
    });
}

async function createPerfectInvoice(outputPath, invoiceData) {
    try {
        console.log(`[Log] Starting Raw Metadata Surgery (v116)...`);
        
        const zugferdXml = generateZugferdXml(invoiceData);
        const xmlPath = outputPath.replace('.pdf', '.xml');
        fs.writeFileSync(xmlPath, zugferdXml, 'utf8');

        const pdfDoc = await PDFDocument.create();
        const visualBuffer = await generatePdfKitBuffer(invoiceData);
        const visualDoc = await PDFDocument.load(visualBuffer);
        const [visualPage] = await pdfDoc.embedPages(visualDoc.getPages());
        pdfDoc.addPage([595.28, 841.89]).drawPage(visualPage);

        pdfDoc.catalog.set(PDFName.of('MarkInfo'), pdfDoc.context.obj({ Marked: PDFBool.True }));
        pdfDoc.catalog.set(PDFName.of('ViewerPreferences'), pdfDoc.context.obj({ DisplayDocTitle: PDFBool.True }));
        pdfDoc.setTitle(`Invoice ${invoiceData.orderId}`);

        const iccPath = 'C:\\Users\\goldb\\Pro\\PDF-API\\app\\server\\Helpers\\sRGB2014.icc';
        const iccBytes = fs.readFileSync(iccPath);
        const iccStream = pdfDoc.context.flateStream(iccBytes, { N: 3, Alternate: PDFName.of('DeviceRGB') });
        const iccRef = pdfDoc.context.register(iccStream);
        const outputIntent = pdfDoc.context.obj({
            Type: 'OutputIntent', S: 'GTS_PDFA1', OutputConditionIdentifier: PDFString.of('sRGB'),
            RegistryName: PDFString.of('http://www.color.org'), Info: PDFString.of('sRGB2014'), DestOutputProfile: iccRef,
        });
        pdfDoc.catalog.set(PDFName.of('OutputIntents'), pdfDoc.context.obj([outputIntent]));

        const xmlBytes = Buffer.from(zugferdXml, 'utf-8');
        const xmlStream = pdfDoc.context.register(pdfDoc.context.flateStream(xmlBytes, { 
            Type: 'EmbeddedFile', Subtype: 'text/xml', Params: { Size: xmlBytes.length } 
        }));
        const fileSpec = pdfDoc.context.register(pdfDoc.context.obj({ 
            Type: 'Filespec', F: PDFString.of('factur-x.xml'), UF: PDFString.of('factur-x.xml'), 
            AFRelationship: 'Alternative', EF: { F: xmlStream } 
        }));
        pdfDoc.catalog.set(PDFName.of('AF'), pdfDoc.context.obj([fileSpec]));
        pdfDoc.catalog.set(PDFName.of('Names'), pdfDoc.context.obj({ 
            EmbeddedFiles: { Names: [PDFString.of('factur-x.xml'), fileSpec] } 
        }));

        // --- THE "FIXED" XMP (No internal newlines, strict nesting) ---
        const xmpContent = '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"><pdfaid:part>3</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance></rdf:Description><rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#"><fx:DocumentFileName>factur-x.xml</fx:DocumentFileName><fx:DocumentType>INVOICE</fx:DocumentType><fx:Version>1.0</fx:Version><fx:ConformanceLevel>EN 16931</fx:ConformanceLevel></rdf:Description><rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#"><pdfaExtension:schemas><rdf:Bag><rdf:li rdf:parseType="Resource"><pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema><pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI><pdfaSchema:prefix>fx</pdfaSchema:prefix><pdfaSchema:property><rdf:Seq><rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentFileName</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>name</pdfaProperty:description></rdf:li><rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentType</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>type</pdfaProperty:description></rdf:li><rdf:li rdf:parseType="Resource"><pdfaProperty:name>Version</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>ver</pdfaProperty:description></rdf:li><rdf:li rdf:parseType="Resource"><pdfaProperty:name>ConformanceLevel</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>lvl</pdfaProperty:description></rdf:li></rdf:Seq></pdfaSchema:property></rdf:li></rdf:Bag></pdfaExtension:schemas></rdf:Description></rdf:RDF></x:xmpmeta>';
        const xmpTail = '<?xpacket end="r"?>';
        // IMPORTANT: Add UTF-8 BOM at start of XMP stream content
        const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
        const bHead = Buffer.from(xmpContent, 'utf8');
        const bTail = Buffer.from(xmpTail, 'utf8');
        const bPad = Buffer.alloc(4096 - bom.length - bHead.length - bTail.length, 0x20);
        const finalXmpBuffer = Buffer.concat([bom, bHead, bPad, bTail]);

        const anchor = "RAW_XMP_V116_SYNC";
        const placeholder = Buffer.alloc(finalXmpBuffer.length, 0x20);
        placeholder.write(anchor, 0);

        // CRITICAL: We use PDFRawStream.of WITHOUT 'FlateDecode' filters to keep it as plain text
        const metadataStream = pdfDoc.context.register(
            PDFRawStream.of(
                pdfDoc.context.obj({ 
                    Type: 'Metadata', 
                    Subtype: 'XML', 
                    Length: finalXmpBuffer.length 
                }),
                placeholder
            )
        );
        pdfDoc.catalog.set(PDFName.of('Metadata'), metadataStream);

        const idHex = '464143545552585f5a5547464552443234'; 
        pdfDoc.context.trailerInfo.ID = pdfDoc.context.obj([PDFString.of(idHex), PDFString.of(idHex)]);

        const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
        let buffer = Buffer.from(pdfBytes);

        const seedPos = buffer.indexOf(anchor);
        if (seedPos !== -1) {
            const streamKey = buffer.lastIndexOf(Buffer.from('stream'), seedPos);
            const dataStart = buffer.indexOf(0x0A, streamKey) + 1;
            const endstreamKey = buffer.indexOf(Buffer.from('endstream'), seedPos);

            buffer.fill(0x20, dataStart, endstreamKey); 
            finalXmpBuffer.copy(buffer, dataStart);
            buffer[endstreamKey - 1] = 0x0A; 

            const exactLength = finalXmpBuffer.length;
            const dictStart = buffer.lastIndexOf(Buffer.from('<<'), streamKey);
            const dictSnippet = buffer.slice(dictStart, streamKey).toString();
            
            // Ensure no /Filter exists in the metadata dictionary
            if (dictSnippet.includes('/Filter')) {
                const filterPos = buffer.indexOf(Buffer.from('/Filter'), dictStart);
                const filterEnd = buffer.indexOf(Buffer.from('/FlateDecode'), filterPos) + 12;
                buffer.fill(0x20, filterPos, filterEnd);
            }

            const lengthMatch = dictSnippet.match(/\/Length (\d+)/);
            if (lengthMatch) {
                const oldLenStr = `/Length ${lengthMatch[1]}`;
                const newLenStr = `/Length ${exactLength}`.padEnd(oldLenStr.length, ' ');
                buffer.write(newLenStr, buffer.indexOf(Buffer.from(oldLenStr), dictStart));
            }

            logDeepBinary(buffer, "Metadata Injection Start", dataStart - 1, 15);
            logDeepBinary(buffer, "Metadata Injection End", endstreamKey - 1, 1);
        }

        fs.writeFileSync(outputPath, buffer);
        console.log(`\n✅ PDF/A-3b Generated with Raw (Uncompressed) XMP.`);
        return true;
    } catch (err) {
        console.error("FAILURE:", err.message);
        return false;
    }
}

module.exports = { createPerfectInvoice };
