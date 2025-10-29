const fs = require("fs");
const path = require("path");
const { PDFDocument, PDFName } = require("pdf-lib");
const {
  generateZugferdXML,
  embedXmp,
  makePdfA3b,
  embedXmlIntoPdf
} = require("../../Helpers/pdf-helpers");

const TEMPLATE_PATH = path.resolve(__dirname, "../../../templates/template_pdfa3b.pdf");

/** Safely parse numbers */
function parseNumber(value, fallback = 0) {
  const num = typeof value === "number" ? value : parseFloat(value);
  return isNaN(num) ? fallback : num;
}

/** Map Shopify order to simple PDF data */
function mapOrderToPdfData(order) {
  const items = (order.line_items || []).map((item) => {
    const price = parseNumber(item.price);
    const quantity = parseNumber(item.quantity, 1);
    const tax = (item.tax_lines || []).reduce((sum, t) => sum + parseNumber(t.price), 0);
    const net = price * quantity;
    const total = net + tax;
    return {
      name: item.title || item.name || "Item",
      quantity,
      price,
      net,
      tax,
      total,
      currency: order.currency || "EUR",
    };
  });

  const subtotal = items.reduce((sum, i) => sum + i.net, 0);
  const taxTotal = items.reduce((sum, i) => sum + i.tax, 0);
  const total = subtotal + taxTotal;

  return {
    orderId: order.name || order.id,
    date: order.created_at
      ? new Date(order.created_at).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    customerName:
      `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim() || "Valued Customer",
    items,
    subtotal,
    tax: taxTotal,
    total,
    currency: order.currency || "EUR",
  };
}

/** Replace placeholders in template */
async function replacePlaceholders(pdfDoc, data) {
  const page = pdfDoc.getPages()[0];

  const placeholders = {
    '{{CUSTOMER_NAME}}': data.customerName,
    '{{INVOICE_NUMBER}}': data.orderId,
    '{{DATE}}': data.date,
    '{{SUBTOTAL}}': data.subtotal.toFixed(2),
    '{{TAX}}': data.tax.toFixed(2),
    '{{TOTAL}}': data.total.toFixed(2),
  };

  for (const [key, value] of Object.entries(placeholders)) {
    // You may need to adjust x,y positions to match your template
    page.drawText(value, { x: 50, y: 700, size: 12 });
  }

  // Optionally add items as simple list
  let y = 650;
  data.items.forEach(item => {
    const line = `${item.name} x${item.quantity} ${item.total.toFixed(2)} ${item.currency}`;
    page.drawText(line, { x: 50, y, size: 10 });
    y -= 20;
  });
}

/** Generate Shopify invoice PDF */
async function createShopifyInvoiceZugferd(order, source = "shopify") {
  const data = mapOrderToPdfData(order);

  const templateBytes = fs.readFileSync(TEMPLATE_PATH);
  const pdfDoc = await PDFDocument.load(templateBytes);

  await replacePlaceholders(pdfDoc, data);
  await embedXmp(pdfDoc);

  const pdfBytes = await pdfDoc.save();
  const pdfA3bBuffer = await makePdfA3b(Buffer.from(pdfBytes));

  // Generate and embed ZUGFeRD XML
  const xmlContent = generateZugferdXML({ ...data, source, currency: data.currency });
  const finalBuffer = await embedXmlIntoPdf(await PDFDocument.load(pdfA3bBuffer), xmlContent).then(doc => doc.save());

  // Save final PDF
  const outputPath = path.resolve(__dirname, "../Generated/Invoice-" + data.orderId + ".pdf");
  fs.writeFileSync(outputPath, finalBuffer);
  console.log(`✅ Final PDF saved at: ${outputPath}`);

  return { pdfBuffer: Buffer.from(finalBuffer), xmlContent };
}

module.exports = { createShopifyInvoiceZugferd };
