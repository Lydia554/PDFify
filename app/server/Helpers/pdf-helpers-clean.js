const { PDFDocument, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

/**
 * Generate PDF/A-3b compliant invoice using pdf-lib
 * Clean implementation without complex binary manipulation
 */
async function createCleanInvoice(outputPath, invoiceData) {
    try {
        console.log(`[Log] Creating PDF/A-3b invoice: ${invoiceData.orderId}`);

        // Create PDF document
        const pdfDoc = await PDFDocument.create();

        // Add page
        const page = pdfDoc.addPage([595, 842]);

        // Use standard fonts - these are always available in pdf-lib
        const font = StandardFonts.Helvetica;
        const fontBold = StandardFonts.HelveticaBold;

        let y = 750;
        const left = 50;

        // Header
        page.drawText('INVOICE', { x: left, y: y, size: 20, font: fontBold });
        y -= 45;

        // Order info
        page.drawText(`Order ID: ${invoiceData.orderId}`, { x: left, y: y, size: 12, font: font });
        y -= 25;
        page.drawText(`Date: ${invoiceData.date}`, { x: left, y: y, size: 12, font: font });
        y -= 45;

        // From/To
        page.drawText('FROM:', { x: left, y: y, size: 11, font: font });
        page.drawText(invoiceData.companyName, { x: left + 55, y: y, size: 12, font: fontBold });
        y -= 25;
        page.drawText('TO:', { x: left + 55, y: y, size: 11, font: font });
        page.drawText(invoiceData.customerName, { x: left + 55, y: y, size: 12, font: fontBold });
        y -= 55;

        // Line items header
        page.drawText('Description        Qty      Price      Total', { x: left, y: y, size: 11, font: fontBold });
        y -= 25;
        page.drawText('---------------------------------------------------', { x: left, y: y, size: 11, font: fontBold });
        y -= 25;

        // Line items
        if (invoiceData.items && invoiceData.items.length > 0) {
            invoiceData.items.forEach(item => {
                const lineTotal = Number(item.quantity) * Number(item.price);
                const text = `${item.name.padEnd(20)} ${item.quantity}      ${Number(item.price).toFixed(2)}    ${lineTotal.toFixed(2)}`;
                page.drawText(text, { x: left, y: y, size: 10, font: font });
                y -= 20;
            });
        }

        // Total
        y += 20;
        page.setFontSize(11);
        page.drawText('---------------------------------------------------', { x: left, y: y, size: 11, font: fontBold });
        y -= 30;
        page.setFontSize(16);
        page.drawText(`TOTAL: ${Number(invoiceData.total).toFixed(2)} ${invoiceData.currency}`, { x: left + 280, y: y, size: 16, font: fontBold });

        // Add XMP metadata with proper PDF/A-3b identification
        const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"><pdfaid:part>3</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="r"?>`;

        // Create metadata stream with UTF-8 BOM
        const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
        const xmpBytes = Buffer.from(xmp, 'utf8');
        const finalXmp = Buffer.concat([bom, xmpBytes]);

        const xmpStream = pdfDoc.context.stream(finalXmp);
        pdfDoc.catalog.set(PDFName.of('Metadata'), xmpStream);

        // Add ICC color profile
        const iccPath = 'C:\\Users\\goldb\\Pro\\PDF-API\\app\\server\\Helpers\\sRGB2014.icc';
        const iccBytes = fs.readFileSync(iccPath);
        const iccStream = pdfDoc.context.stream(iccBytes);
        const outputIntent = pdfDoc.context.obj({
            Type: 'OutputIntent', S: 'GTS_PDFA1', OutputConditionIdentifier: 'sRGB',
            RegistryName: 'http://www.color.org', Info: 'sRGB2014',
            DestOutputProfile: pdfDoc.context.register(iccStream)
        });
        pdfDoc.catalog.set(PDFName.of('OutputIntents'), pdfDoc.context.obj([outputIntent]));

        // Attach ZUGFeRD XML
        const zugferdXml = require('../../xml/generateZugferdXml')(invoiceData);
        const xmlBytes = Buffer.from(zugferdXml, 'utf8');

        const xmlStream = pdfDoc.context.stream(xmlBytes);
        const fileSpec = pdfDoc.context.obj({
            Type: 'Filespec', F: 'factur-x.xml', UF: 'factur-x.xml',
            AFRelationship: 'Alternative', EF: { F: xmlStream }
        });
        const afArray = pdfDoc.context.obj([fileSpec]);
        pdfDoc.catalog.set(PDFName.of('AF'), afArray);
        pdfDoc.catalog.set(PDFName.of('Names'), pdfDoc.context.obj({
            EmbeddedFiles: { Names: ['factur-x.xml'], fileSpec }
        }));

        // Save PDF
        const pdfBytes = await pdfDoc.save();
        fs.writeFileSync(outputPath, pdfBytes);

        console.log(`[Log] ${outputPath} created with size: ${pdfBytes.length}`);
        return outputPath;

    } catch (error) {
        console.error(`[Log] Error: ${error.message}`);
        throw error;
    }
}

module.exports = { createCleanInvoice };
