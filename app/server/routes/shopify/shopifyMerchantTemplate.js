// shopifyMerchantTemplate.js
const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb, PDFName, PDFString } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const { embedXmp, generateZugferdXML, makePdfA3b } = require("../../Helpers/pdf-helpers");

/** Safely parse numbers */
function parseNumber(value, fallback = 0) {
  const num = typeof value === "number" ? value : parseFloat(value);
  return isNaN(num) ? fallback : num;
}

/** Map Shopify order to PDF-ready data */
function mapOrderToPdfData(order, shopConfig = {}) {
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
      taxRate: 21,
      currency: order.currency || "EUR",
    };
  });

  const subtotal = items.reduce((sum, i) => sum + i.net, 0);
  const taxTotal = items.reduce((sum, i) => sum + i.tax, 0);
  const total = subtotal + taxTotal;

  return {
    orderId: order.name || order.id,
    date: order.created_at ? new Date(order.created_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    customerName: `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim() || "Valued Customer",
    items,
    subtotal,
    tax: taxTotal,
    total,
    vatRate: 21,
    currency: order.currency || "EUR",
    iban: shopConfig.iban || "DE89370400440532013000",
    bic: shopConfig.bic || "COBADEFFXXX",
    paymentTerms: order.payment?.terms || "Due within 14 days",
  };
}

/** Draw table cell with optional background */
function drawCell(page, text, x, y, width, height, font, { size = 10, align = "left", backgroundColor = null, textColor = rgb(0,0,0) } = {}) {
  if (backgroundColor) {
    page.drawRectangle({ x, y, width, height, color: backgroundColor });
  }
  page.drawRectangle({ x, y, width, height, borderColor: rgb(0, 0, 0), borderWidth: 0.5 });
  
  let textX = x + 2;
  if (align === "right") textX = x + width - (text.length * size * 0.5) - 2;
  page.drawText(text, { x: textX, y: y + height / 4, size, font, color: textColor });
}


/** Attach ZUGFeRD XML after PDF/A-3b conversion */
async function attachZugferdAfterPdfA3b(pdfBuffer, xmlContent) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const xmlBytes = Buffer.from(xmlContent, "utf8");

  const xmlStream = pdfDoc.context.flateStream(xmlBytes, {
    Type: PDFName.of("EmbeddedFile"),
    Subtype: PDFName.of("text#2Fxml"),
  });

  const fileSpecDict = pdfDoc.context.obj({
    Type: "Filespec",
    F: PDFString.of("ZUGFeRD-invoice.xml"),
    UF: PDFString.of("ZUGFeRD-invoice.xml"),
    AFRelationship: PDFName.of("Alternative"),
    EF: { F: xmlStream },
  });

  const fileSpecRef = pdfDoc.context.register(fileSpecDict);
  const catalog = pdfDoc.catalog;
  catalog.set(PDFName.of("AF"), pdfDoc.context.obj([fileSpecRef]));

  const namesDict = pdfDoc.context.obj({
    EmbeddedFiles: pdfDoc.context.obj({
      Names: [PDFString.of("ZUGFeRD-invoice.xml"), fileSpecRef],
    }),
  });
  catalog.set(PDFName.of("Names"), namesDict);

  return Buffer.from(await pdfDoc.save());
}

/** Generate Shopify invoice PDF with ZUGFeRD 2.3 Comfort XML and styled colors */
async function createShopifyInvoiceZugferd(order, shopConfig = {}) {
  const data = mapOrderToPdfData(order, shopConfig);
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const regularFontBytes = fs.readFileSync(path.resolve(__dirname, "../../../templates/fonts/LiberationSans-Regular.ttf"));
  const boldFontBytes = fs.readFileSync(path.resolve(__dirname, "../../../templates/fonts/LiberationSans-Bold.ttf"));
  const regularFont = await pdfDoc.embedFont(regularFontBytes);
  const boldFont = await pdfDoc.embedFont(boldFontBytes);

  const page = pdfDoc.addPage([595, 842]);
  let y = 780;
  const lineHeight = 24;
  const rowHeight = 24;
  const colWidths = [180, 60, 80, 80, 80];
  const headers = ["Item", "Qty", "Price", "Tax", "Total"];

  // -------------------------------
  // Header block (like Amazon/Shopify)
  // -------------------------------
  // Draw colored banner
  page.drawRectangle({ x: 0, y: y - 6, width: 595, height: 90, color: rgb(0.0, 0.2, 0.5) });

  // Company logo placeholder (replace with image embedding if needed)
  page.drawRectangle({ x: 50, y: y - 60, width: 100, height: 50, color: rgb(1, 1, 1) });
  page.drawText("LOGO", { x: 75, y: y - 35, size: 14, font: boldFont, color: rgb(0, 0, 0) });

  // Company info
  const companyName = shopConfig.companyName || "Your Company GmbH";
  const companyAddress = shopConfig.address || "Street 12, 12345 City, Country";
  const companyContact = shopConfig.contact || "email@example.com | +49 123 456789";

  page.drawText(companyName, { x: 200, y, size: 18, font: boldFont, color: rgb(1, 1, 1) });
  page.drawText(companyAddress, { x: 200, y: y - 20, size: 12, font: regularFont, color: rgb(1, 1, 1) });
  page.drawText(companyContact, { x: 200, y: y - 40, size: 12, font: regularFont, color: rgb(1, 1, 1) });

  // Invoice info
  page.drawText(`INVOICE: ${data.orderId}`, { x: 50, y: y - 70, size: 16, font: boldFont, color: rgb(1, 1, 1) });
  page.drawText(`Date: ${data.date}`, { x: 200, y: y - 70, size: 12, font: regularFont, color: rgb(1, 1, 1) });
  page.drawText(`Customer: ${data.customerName}`, { x: 50, y: y - 90, size: 12, font: regularFont, color: rgb(1, 1, 1) });

  y -= 120; // Move down below header

  // -------------------------------
  // Table headers with light gray
  // -------------------------------
  let x = 50;
  headers.forEach((header, i) => {
    drawCell(page, header, x, y, colWidths[i], rowHeight, boldFont, { size: 10, align: i > 1 ? "right" : "left", backgroundColor: rgb(0.9, 0.9, 0.9) });
    x += colWidths[i];
  });
  y -= rowHeight;

  // -------------------------------
  // Table rows with alternating colors
  // -------------------------------
  data.items.forEach((item, rowIndex) => {
    const bgColor = rowIndex % 2 === 0 ? rgb(1, 1, 1) : rgb(0.95, 0.95, 0.95);
    x = 50;
    const row = [
      item.name,
      String(item.quantity),
      item.price.toFixed(2) + ` ${item.currency}`,
      item.tax.toFixed(2) + ` ${item.currency}`,
      item.total.toFixed(2) + ` ${item.currency}`
    ];
    row.forEach((cell, i) => {
      drawCell(page, cell, x, y, colWidths[i], rowHeight, regularFont, { size: 10, align: i > 1 ? "right" : "left", backgroundColor: bgColor });
      x += colWidths[i];
    });
    y -= rowHeight;
  });

  // -------------------------------
  // Totals section with highlight
  // -------------------------------
  const totalLabels = ["Subtotal", "Tax", "Total"];
  const totalValues = [data.subtotal, data.tax, data.total];
  totalLabels.forEach((label, i) => {
    y -= rowHeight;
    drawCell(page, label, 50, y, 400, rowHeight, boldFont, { size: label === "Total" ? 12 : 10, align: "right", backgroundColor: rgb(1, 1, 0.8) });
    drawCell(page, totalValues[i].toFixed(2) + ` ${data.currency}`, 450, y, 80, rowHeight, boldFont, { size: label === "Total" ? 12 : 10, align: "right", backgroundColor: rgb(1, 1, 0.8) });
  });

  // -------------------------------
  // Embed XMP and PDF/A-3b conversion
  // -------------------------------
  await embedXmp(pdfDoc);
  const pdfBytes = await pdfDoc.save();
  const pdfA3bBuffer = await makePdfA3b(Buffer.from(pdfBytes));

  // -------------------------------
  // Generate ZUGFeRD XML 2.3 Comfort
  // -------------------------------
  const xmlContent = generateZugferdXML({
    ...data,
    source: "shopify",
    currency: data.currency
  });

  const finalBuffer = await attachZugferdAfterPdfA3b(pdfA3bBuffer, xmlContent);
  return finalBuffer;
}


module.exports = { createShopifyInvoiceZugferd };
