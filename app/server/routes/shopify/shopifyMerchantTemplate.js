const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const { PDFDocument, rgb } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");

// ---------------------
// Map Shopify order → PDF data
// ---------------------
function mapOrderToPdfData(order, shopConfig = {}) {
  const items = (order.line_items || []).map((item, index) => {
    const price = parseFloat(item.price || 0);
    const quantity = parseFloat(item.quantity || 1);
    const tax = (item.tax_lines || []).reduce((sum, t) => sum + parseFloat(t.price || 0), 0);
    const net = price * quantity;
    const total = net + tax;

    return {
      position: index + 1,         
      name: item.title || item.name || "Item",
      quantity,
      unitCode: "EA",            
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
    creator: "PDFify",
    companyName: shopConfig.companyName || "YOUR COMPANY GMBH", 
    locale: { language: order.locale || "en" },
  };
}

async function createBasePdf(data) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  // Embed fonts
  const regularFontBytes = fs.readFileSync(path.resolve(__dirname, "../../../templates/fonts/LiberationSans-Regular.ttf"));
  const boldFontBytes = fs.readFileSync(path.resolve(__dirname, "../../../templates/fonts/LiberationSans-Bold.ttf"));
  const regularFont = await pdfDoc.embedFont(regularFontBytes);
  const boldFont = await pdfDoc.embedFont(boldFontBytes);

  function asciiSafe(str) {
    if (!str) return " ";
    return str.replace(/[^\x20-\x7E]/g, ""); 
  }

  // sanitize metadata
  pdfDoc.setTitle(asciiSafe(data.companyName || "Invoice"));
  pdfDoc.setAuthor(asciiSafe("PDFify"));
  pdfDoc.setSubject(" ");
  pdfDoc.setCreator(asciiSafe("PDFify"));
  pdfDoc.setProducer(asciiSafe("pdf-lib"));

  // sanitize table & page content
  data.customerName = asciiSafe(data.customerName);
  data.companyName = asciiSafe(data.companyName);
  data.items.forEach(item => {
    item.name = asciiSafe(item.name);
  });

  const page = pdfDoc.addPage([595, 842]);
  let y = 780;
  const rowHeight = 24;
  const colWidths = [180, 60, 80, 80, 80];
  const headers = ["Item", "Qty", "Price", "Tax", "Total"];

  // Header
  page.drawRectangle({ x: 0, y: 780, width: 595, height: 40, color: rgb(0.18, 0.31, 0.61) });

  if (data.logoPath && fs.existsSync(data.logoPath)) {
    const logoBytes = fs.readFileSync(data.logoPath);
    const logoImage = await pdfDoc.embedPng(logoBytes);
    const logoDims = logoImage.scale(0.25);
    page.drawImage(logoImage, { x: 40, y: 784 - logoDims.height / 2, width: logoDims.width, height: logoDims.height });
  }

  page.drawText(String(data.companyName || "YOUR COMPANY GMBH"), { x: 220, y: 794, size: 16, font: boldFont, color: rgb(1,1,1) });
  page.drawText(`INVOICE #${String(data.orderId || "UNKNOWN")}`, { x: 50, y, size: 18, font: boldFont, color: rgb(0.2,0.2,0.7) });
  page.drawText(`Date: ${String(data.date || new Date().toISOString().slice(0,10))}`, { x: 50, y, size: 12, font: regularFont });
  page.drawText(`Customer: ${String(data.customerName || "Valued Customer")}`, { x: 50, y, size: 12, font: regularFont });

  // Table headers
  let x = 50;
  headers.forEach((header, i) => {
    page.drawText(asciiSafe(header), { x, y, size: 10, font: boldFont, color: rgb(0, 0, 0) });
    x += colWidths[i];
  });
  y -= rowHeight;

  // Table rows
  data.items.forEach((item) => {
    let x = 50;
    const row = [
      item.name,
      item.quantity != null ? String(item.quantity) : "0",
      item.price != null ? item.price.toFixed(2) : "0.00",
      item.tax != null ? item.tax.toFixed(2) : "0.00",
      item.total != null ? item.total.toFixed(2) : "0.00"
    ];

    row.forEach((cell, i) => {
      page.drawText(cell, { x, y, size: 10, font: regularFont, color: rgb(0, 0, 0) });
      x += colWidths[i];
    });

    y -= rowHeight;
  });

  return Buffer.from(await pdfDoc.save());
}


async function createShopifyInvoiceZugferd(order, shopConfig = {}) {
  const data = mapOrderToPdfData(order, shopConfig);
  const pdfBuffer = await createBasePdf(data);

  const form = new FormData();
  form.append("invoiceData", JSON.stringify(data));
  form.append("pdfFile", pdfBuffer, {
    filename: `Invoice-${data.orderId}.pdf`,
    contentType: "application/pdf",
    knownLength: pdfBuffer.length,
  });

  const pythonUrl = process.env.PYTHON_SERVICE_URL || "http://python-service:5000/generate-zugferd";

  try {
    const response = await axios.post(pythonUrl, form, {
      headers: form.getHeaders(),
      responseType: "arraybuffer", // still need PDF on success
      timeout: 20000,
      validateStatus: () => true,  // do not throw on 500 automatically
    });

    if (response.status !== 200) {
      let text = "";
      try {
        text = response.data.toString("utf-8");
      } catch {}
      console.error("❌ Python service returned error:", response.status, text);
      throw new Error(`Python ZUGFeRD service error: ${response.status}`);
    }

    const outputDir = path.resolve(__dirname, "../Generated");
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `Invoice-ZUGFeRD-${data.orderId}.pdf`);
    fs.writeFileSync(outputPath, response.data);

    console.log(`✅ Final ZUGFeRD PDF saved: ${outputPath}`);
    return { pdfPath: outputPath, pdfBuffer: response.data };

  } catch (err) {
    if (err.response) {
      let text = "";
      try {
        text = err.response.data.toString("utf-8");
      } catch {}
      console.error("❌ Python error body:", text);
    }
    console.error("❌ Failed to connect to Python ZUGFeRD service:", err.message);
    throw err;
  }
}

module.exports = { createShopifyInvoiceZugferd, createBasePdf };
