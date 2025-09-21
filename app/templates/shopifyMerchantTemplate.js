const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");

/**
 * Safely parse numbers
 */
function parseNumber(value, fallback = 0) {
  const num = typeof value === "number" ? value : parseFloat(value);
  return isNaN(num) ? fallback : num;
}

/**
 * Map Shopify order to simple PDF data
 */
function mapOrderToPdfData(order) {
  const items = (order.line_items || []).map(item => {
    const price = parseNumber(item.price);
    const quantity = parseNumber(item.quantity, 1);
    const tax = (item.tax_lines || []).reduce((sum, t) => sum + parseNumber(t.price), 0);
    const total = price * quantity + tax;
    return { name: item.title, quantity, price, tax, total };
  });

  const subtotal = parseNumber(order.subtotal_price);
  const tax = parseNumber(order.total_tax);
  const total = parseNumber(order.total_price);

  return {
    customerName: `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim() || "Valued Customer",
    orderId: order.name || order.id,
    date: order.created_at ? new Date(order.created_at).toLocaleDateString("de-DE") : new Date().toLocaleDateString("de-DE"),
    items,
    subtotal,
    tax,
    total,
  };
}

/**
 * Generate PDF buffer from order data
 */
async function createShopifyInvoicePdf(order, options = {}) {
  const data = mapOrderToPdfData(order);
  const pdfDoc = await PDFDocument.create();

  const page = pdfDoc.addPage([595, 842]); // A4 size
  const { width } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let y = 800;
  const lineHeight = 18;

  page.drawText(`Invoice: ${data.orderId}`, { x: 50, y, size: 14, font, color: rgb(0, 0, 0) });
  y -= lineHeight;
  page.drawText(`Date: ${data.date}`, { x: 50, y, size: 12, font, color: rgb(0, 0, 0) });
  y -= lineHeight;
  page.drawText(`Customer: ${data.customerName}`, { x: 50, y, size: 12, font, color: rgb(0, 0, 0) });
  y -= lineHeight * 2;

  // Table headers
  page.drawText(`Item`, { x: 50, y, size: 12, font, color: rgb(0, 0, 0) });
  page.drawText(`Qty`, { x: 250, y, size: 12, font, color: rgb(0, 0, 0) });
  page.drawText(`Price`, { x: 300, y, size: 12, font, color: rgb(0, 0, 0) });
  page.drawText(`Tax`, { x: 380, y, size: 12, font, color: rgb(0, 0, 0) });
  page.drawText(`Total`, { x: 450, y, size: 12, font, color: rgb(0, 0, 0) });
  y -= lineHeight;

  // Table rows
  data.items.forEach(item => {
    page.drawText(item.name, { x: 50, y, size: 12, font });
    page.drawText(String(item.quantity), { x: 250, y, size: 12, font });
    page.drawText(item.price.toFixed(2), { x: 300, y, size: 12, font });
    page.drawText(item.tax.toFixed(2), { x: 380, y, size: 12, font });
    page.drawText(item.total.toFixed(2), { x: 450, y, size: 12, font });
    y -= lineHeight;
  });

  y -= lineHeight;
  page.drawText(`Subtotal: ${data.subtotal.toFixed(2)}`, { x: 50, y, size: 12, font });
  y -= lineHeight;
  page.drawText(`Tax: ${data.tax.toFixed(2)}`, { x: 50, y, size: 12, font });
  y -= lineHeight;
  page.drawText(`Total: ${data.total.toFixed(2)}`, { x: 50, y, size: 12, font });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

module.exports = { createShopifyInvoicePdf };
