const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { PDFDocument, rgb } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");

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
    const tax = (item.tax_lines || []).reduce(
      (sum, t) => sum + parseNumber(t.price),
      0
    );
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
    date: order.created_at
      ? new Date(order.created_at).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    customerName:
      `${order.customer?.first_name || ""} ${
        order.customer?.last_name || ""
      }`.trim() || "Valued Customer",
    items,
    subtotal,
    tax: taxTotal,
    total,
    vatRate: 21,
    currency: order.currency || "EUR",
    iban: shopConfig.iban || "DE89370400440532013000",
    bic: shopConfig.bic || "COBADEFFXXX",
    paymentTerms: order.payment?.terms || "Due within 14 days",
    logoPath: shopConfig.logoPath,
    companyName: shopConfig.companyName || "YOUR COMPANY GMBH",
  };
}

/** Draw table cell */
function drawCell(page, text, x, y, width, height, font, { size = 10, align = "left", bgColor } = {}) {
  if (bgColor) page.drawRectangle({ x, y, width, height, color: bgColor });
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: rgb(0.8, 0.8, 0.8),
    borderWidth: 0.5,
  });
  let textX = x + 4;
  if (align === "right") textX = x + width - text.length * size * 0.5 - 4;
  page.drawText(text, {
    x: textX,
    y: y + height / 4,
    size,
    font,
    color: rgb(0, 0, 0),
  });
}

/** Create the base PDF layout (Amazon-style) */
async function createBasePdf(data) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  // Fonts
  const regularFontBytes = fs.readFileSync(
    path.resolve(__dirname, "../../../templates/fonts/LiberationSans-Regular.ttf")
  );
  const boldFontBytes = fs.readFileSync(
    path.resolve(__dirname, "../../../templates/fonts/LiberationSans-Bold.ttf")
  );
  const regularFont = await pdfDoc.embedFont(regularFontBytes);
  const boldFont = await pdfDoc.embedFont(boldFontBytes);

  // Create page
  const page = pdfDoc.addPage([595, 842]);
  let y = 780;
  const lineHeight = 24;
  const rowHeight = 24;
  const colWidths = [180, 60, 80, 80, 80];
  const headers = ["Item", "Qty", "Price", "Tax", "Total"];

  // Header bar
  page.drawRectangle({
    x: 0,
    y: 780,
    width: 595,
    height: 40,
    color: rgb(0.18, 0.31, 0.61),
  });

  // Logo + company name
  if (data.logoPath && fs.existsSync(data.logoPath)) {
    const logoBytes = fs.readFileSync(data.logoPath);
    const logoImage = await pdfDoc.embedPng(logoBytes);
    const logoDims = logoImage.scale(0.25);
    page.drawImage(logoImage, {
      x: 40,
      y: 784 - logoDims.height / 2,
      width: logoDims.width,
      height: logoDims.height,
    });
  }

  page.drawText(data.companyName, {
    x: 220,
    y: 794,
    size: 16,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  y -= 80;

  // Invoice info
  page.drawText(`INVOICE #${data.orderId}`, {
    x: 50,
    y,
    size: 18,
    font: boldFont,
    color: rgb(0.2, 0.2, 0.7),
  });
  y -= lineHeight;
  page.drawText(`Date: ${data.date}`, { x: 50, y, size: 12, font: regularFont });
  y -= lineHeight;
  page.drawText(`Customer: ${data.customerName}`, {
    x: 50,
    y,
    size: 12,
    font: regularFont,
  });
  y -= lineHeight;
  page.drawText(`IBAN: ${data.iban}`, { x: 50, y, size: 12, font: regularFont });
  y -= lineHeight;
  page.drawText(`BIC: ${data.bic}`, { x: 50, y, size: 12, font: regularFont });
  y -= lineHeight;
  page.drawText(`Payment terms: ${data.paymentTerms}`, {
    x: 50,
    y,
    size: 12,
    font: regularFont,
  });
  y -= lineHeight * 2;

  // Table headers
  let x = 50;
  headers.forEach((header, i) => {
    drawCell(page, header, x, y, colWidths[i], rowHeight, boldFont, {
      size: 10,
      align: i > 1 ? "right" : "left",
      bgColor: rgb(0.88, 0.91, 0.98),
    });
    x += colWidths[i];
  });
  y -= rowHeight;

  // Table rows
  data.items.forEach((item) => {
    x = 50;
    const row = [
      item.name,
      String(item.quantity),
      item.price.toFixed(2) + ` ${item.currency}`,
      item.tax.toFixed(2) + ` ${item.currency}`,
      item.total.toFixed(2) + ` ${item.currency}`,
    ];
    row.forEach((cell, i) => {
      drawCell(page, cell, x, y, colWidths[i], rowHeight, regularFont, {
        size: 10,
        align: i > 1 ? "right" : "left",
      });
      x += colWidths[i];
    });
    y -= rowHeight;
  });

  // Totals
  const totalLabels = ["Subtotal", "Tax", "Total"];
  const totalValues = [data.subtotal, data.tax, data.total];
  totalLabels.forEach((label, i) => {
    y -= rowHeight;
    drawCell(page, label, 50, y, 400, rowHeight, boldFont, {
      size: label === "Total" ? 12 : 10,
      align: "right",
      bgColor: i === 2 ? rgb(0.95, 0.95, 1) : undefined,
    });
    drawCell(
      page,
      totalValues[i].toFixed(2) + ` ${data.currency}`,
      450,
      y,
      80,
      rowHeight,
      boldFont,
      { size: label === "Total" ? 12 : 10, align: "right" }
    );
  });

  return Buffer.from(await pdfDoc.save());
}

/** Generate PDF and send to Python microservice for ZUGFeRD embedding */


async function createShopifyInvoiceZugferd(order, shopConfig = {}) {
  const data = mapOrderToPdfData(order, shopConfig);
  const pdfBuffer = await createBasePdf(data);

  const form = new FormData();
  form.append("invoiceData", JSON.stringify(data));
  form.append("pdfFile", pdfBuffer, {
    filename: `Invoice-${data.orderId}.pdf`,
    contentType: "application/pdf",
  });

  const pythonUrl = process.env.PYTHON_SERVICE_URL || "http://python-service:5000/generate-zugferd";

  try {
    const response = await axios.post(pythonUrl, form, {
      headers: form.getHeaders(),
      responseType: "arraybuffer",
      timeout: 20000,
    });

    const outputDir = path.resolve(__dirname, "../Generated");
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `Invoice-ZUGFeRD-${data.orderId}.pdf`);
    fs.writeFileSync(outputPath, response.data);

    console.log(`✅ Final ZUGFeRD PDF saved: ${outputPath}`);
    return { pdfPath: outputPath, pdfBuffer: response.data };
  } catch (err) {
    console.error("❌ Failed to connect to Python ZUGFeRD service:", err.message);
    throw err;
  }
}

module.exports = { createShopifyInvoiceZugferd };
