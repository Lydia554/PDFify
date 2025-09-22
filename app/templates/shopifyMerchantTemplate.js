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
 * Draw a table cell with optional border
 */
function drawCell(page, text, x, y, width, height, font, size = 10, align = "left") {
  // Draw text
  let textX = x + 2; // padding
  if (align === "right") textX = x + width - (text.length * size * 0.5) - 2;
  page.drawText(text, { x: textX, y: y + height / 4, size, font, color: rgb(0, 0, 0) });

  // Draw border rectangle
  page.drawRectangle({
    x, y,
    width, height,
    borderColor: rgb(0, 0, 0),
    borderWidth: 0.5,
    color: undefined
  });
}

/**
 * Generate PDF buffer from order data
 */
async function createShopifyInvoicePdf(order) {
  const data = mapOrderToPdfData(order);
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4 size
  const { width } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let y = 780;
  const lineHeight = 20;

  // Header
  page.drawText(`INVOICE: ${data.orderId}`, { x: 50, y, size: 16, font, color: rgb(0, 0, 0) });
  y -= lineHeight;
  page.drawText(`Date: ${data.date}`, { x: 50, y, size: 12, font, color: rgb(0, 0, 0) });
  y -= lineHeight;
  page.drawText(`Customer: ${data.customerName}`, { x: 50, y, size: 12, font, color: rgb(0, 0, 0) });
  y -= lineHeight * 2;

  // Table setup
  const colWidths = [180, 60, 80, 80, 80];
  const headers = ["Item", "Qty", "Price", "Tax", "Total"];
  let x = 50;
  const rowHeight = 20;

  // Draw header row
  headers.forEach((header, i) => {
    drawCell(page, header, x, y, colWidths[i], rowHeight, font, 10, i > 1 ? "right" : "left");
    x += colWidths[i];
  });

  y -= rowHeight;

  // Draw item rows
  data.items.forEach(item => {
    x = 50;
    const row = [item.name, String(item.quantity), item.price.toFixed(2), item.tax.toFixed(2), item.total.toFixed(2)];
    row.forEach((cell, i) => {
      drawCell(page, cell, x, y, colWidths[i], rowHeight, font, 10, i > 1 ? "right" : "left");
      x += colWidths[i];
    });
    y -= rowHeight;
  });

  // Totals section
  y -= rowHeight;
  drawCell(page, "Subtotal", 50, y, 400, rowHeight, font, 10, "right");
  drawCell(page, data.subtotal.toFixed(2), 450, y, 80, rowHeight, font, 10, "right");
  y -= rowHeight;

  drawCell(page, "Tax", 50, y, 400, rowHeight, font, 10, "right");
  drawCell(page, data.tax.toFixed(2), 450, y, 80, rowHeight, font, 10, "right");
  y -= rowHeight;

  drawCell(page, "Total", 50, y, 400, rowHeight, font, 12, "right");
  drawCell(page, data.total.toFixed(2), 450, y, 80, rowHeight, font, 12, "right");

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

module.exports = { createShopifyInvoicePdf };
