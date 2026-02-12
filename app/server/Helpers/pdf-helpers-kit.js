const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

async function createInvoiceKit(outputPath, invoiceData) {
    return new Promise((resolve, reject) => {
        try {
            console.log(`[PDFKit] Creating invoice: ${invoiceData.orderId}`);

            const doc = new PDFDocument({
                size: 'A4',
                margin: 50,
                bufferPages: true,
                info: {
                    Title: `Invoice ${invoiceData.orderId}`,
                    Author: 'PDFKit PDF/A-3B',
                    Creator: 'Node.js PDFKit Service',
                    Producer: 'PDFKit'
                }
            });

            // Register a font
            doc.registerFont(__dirname + '/../../templates/fonts/LiberationSans-Regular.ttf', {
                family: 'Liberation Sans'
            });

            let y = 750;

            // Header
            doc.font('Liberation Sans').fontSize(20).fillColor([0, 0, 0]).text('INVOICE', 50, y);
            y -= 40;

            // Order
            doc.font('Liberation Sans').fontSize(12).text(`Order ID: ${invoiceData.orderId}`, 50, y);
            y -= 20;
            doc.font('Liberation Sans').text(`Date: ${invoiceData.date}`, 50, y);
            y -= 40;

            // From
            doc.font('Liberation Sans').fontSize(11).text('FROM:', 50, y);
            doc.font('Liberation Sans').fontSize(12).text(invoiceData.companyName, 105, y);
            y -= 20;
            doc.font('Liberation Sans').fontSize(11).text('TO:', 50, y);
            doc.font('Liberation Sans').fontSize(12).text(invoiceData.customerName, 105, y);
            y -= 50;

            // Line items
            doc.font('Liberation Sans').fontSize(11).text('Description        Qty      Price      Total', 50, y);
            y -= 20;
            doc.font('Liberation Sans').text('---------------------------------------------------', 50, y);
            y -= 20;

            // Line items
            if (invoiceData.items && invoiceData.items.length > 0) {
                invoiceData.items.forEach(item => {
                    const qty = item.quantity || 0;
                    const price = item.price || 0;
                    const total = qty * price;
                    const text = `${item.name.toString().padEnd(20)} ${qty}      ${price.toFixed(2)}    ${total.toFixed(2)}`;
                    doc.font('Liberation Sans').fontSize(10).text(text, 50, y);
                    y -= 18;
                });
            }

            // Total
            y += 20;
            doc.font('Liberation Sans').fontSize(11).text('---------------------------------------------------', 50, y);
            y -= 30;
            doc.font('Liberation Sans').fontSize(16).text(`TOTAL: ${(invoiceData.total || 0).toFixed(2)} ${invoiceData.currency || 'EUR'}`, 300, y);

            // Get PDF as buffer
            const buffer = await new Promise((res, rej) => {
                doc.on('data', res.push.bind(null, buffer));
                doc.on('end', () => res());
                doc.on('error', rej);
            });

            // Write to file
            fs.writeFileSync(outputPath, buffer);

            console.log(`[PDFKit] PDF created: ${outputPath}`);
            console.log(`[PDFKit] Size: ${buffer.length} bytes`);
            resolve(outputPath);

        } catch (error) {
            reject(error);
        }
    });
}

module.exports = { createInvoiceKit };
