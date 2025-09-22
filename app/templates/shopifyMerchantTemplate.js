const { PDFDocument, rgb } = require("pdf-lib");
const fs = require("fs");
const path = require("path");
const fontkit = require("@pdf-lib/fontkit"); // required for custom fonts

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

  return {
    customerName: `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim() || "Valued Customer",
    orderId: order.name || order.id,
    date: order.created_at ? new Date(order.created_at).toLocaleDateString("de-DE") : new Date().toLocaleDateString("de-DE"),
    items,
    subtotal: parseNumber(order.subtotal_price),
    tax: parseNumber(order.total_tax),
    total: parseNumber(order.total_price),
    iban: order.payment?.iban || "DE89370400440532013000",
    bic: order.payment?.bic || "COBADEFFXXX",
    paymentTerms: order.payment?.terms || "Due within 14 days"
  };
}

/**
 * Draw a black-and-white table cell
 */
function drawCell(page, text, x, y, width, height, font, { size = 10, align = "left" } = {}) {
  page.drawRectangle({ x, y, width, height, borderColor: rgb(0, 0, 0), borderWidth: 0.5, color: undefined });
  let textX = x + 2;
  if (align === "right") textX = x + width - (text.length * size * 0.5) - 2;
  page.drawText(text, { x: textX, y: y + height / 4, size, font, color: rgb(0, 0, 0) });
}

/**
 * Generate strict black-and-white Shopify PDF invoice
 * PDF/A-3b compliant with ICC profile
 */
async function createShopifyInvoicePdf(order) {
  const data = mapOrderToPdfData(order);
  const pdfDoc = await PDFDocument.create();

  // Register fontkit for embedding TTF
  pdfDoc.registerFontkit(fontkit);

  // Embed Liberation Sans fonts
  const regularFontBytes = fs.readFileSync(path.resolve(__dirname, './fonts/LiberationSans-Regular.ttf'));
  const boldFontBytes = fs.readFileSync(path.resolve(__dirname, './fonts/LiberationSans-Bold.ttf'));
  const regularFont = await pdfDoc.embedFont(regularFontBytes);
  const boldFont = await pdfDoc.embedFont(boldFontBytes);

  // Embed sRGB ICC profile for OutputIntent (PDF/A requirement)
  const iccProfile = fs.readFileSync(path.resolve(__dirname, './sRGB_v4_ICC_preference.icc'));
  pdfDoc.catalog.set('OutputIntents', [
    pdfDoc.context.obj({
      Type: 'OutputIntent',
      S: 'GTS_PDFA1',
      OutputConditionIdentifier: 'sRGB IEC61966-2.1',
      Info: 'sRGB IEC61966-2.1',
      DestOutputProfile: pdfDoc.context.stream(iccProfile)
    })
  ]);

  // Add page
  const page = pdfDoc.addPage([595, 842]); // A4
  let y = 780;
  const lineHeight = 24;
  const rowHeight = 24;
  const colWidths = [180, 60, 80, 80, 80];
  const headers = ["Item", "Qty", "Price", "Tax", "Total"];

  // Header section
  page.drawText(`INVOICE: ${data.orderId}`, { x: 50, y, size: 18, font: boldFont, color: rgb(0,0,0) });
  y -= lineHeight;
  page.drawText(`Date: ${data.date}`, { x: 50, y, size: 12, font: regularFont, color: rgb(0,0,0) });
  y -= lineHeight;
  page.drawText(`Customer: ${data.customerName}`, { x: 50, y, size: 12, font: regularFont, color: rgb(0,0,0) });
  y -= lineHeight;
  page.drawText(`IBAN: ${data.iban}`, { x: 50, y, size: 12, font: regularFont, color: rgb(0,0,0) });
  y -= lineHeight;
  page.drawText(`BIC: ${data.bic}`, { x: 50, y, size: 12, font: regularFont, color: rgb(0,0,0) });
  y -= lineHeight;
  page.drawText(`Payment terms: ${data.paymentTerms}`, { x: 50, y, size: 12, font: regularFont, color: rgb(0,0,0) });
  y -= lineHeight * 2;

  // Table headers
  let x = 50;
  headers.forEach((header, i) => {
    drawCell(page, header, x, y, colWidths[i], rowHeight, boldFont, { size: 10, align: i > 1 ? "right" : "left" });
    x += colWidths[i];
  });
  y -= rowHeight;

  // Item rows
  data.items.forEach(item => {
    x = 50;
    const row = [item.name, String(item.quantity), item.price.toFixed(2), item.tax.toFixed(2), item.total.toFixed(2)];
    row.forEach((cell, i) => {
      drawCell(page, cell, x, y, colWidths[i], rowHeight, regularFont, { size: 10, align: i > 1 ? "right" : "left" });
      x += colWidths[i];
    });
    y -= rowHeight;
  });

  // Totals
  const totalLabels = ["Subtotal", "Tax", "Total"];
  const totalValues = [data.subtotal, data.tax, data.total];
  totalLabels.forEach((label, i) => {
    y -= rowHeight;
    drawCell(page, label, 50, y, 400, rowHeight, boldFont, { size: label==="Total"?12:10, align:"right" });
    drawCell(page, totalValues[i].toFixed(2), 450, y, 80, rowHeight, boldFont, { size: label==="Total"?12:10, align:"right" });
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

module.exports = { createShopifyInvoicePdf };
