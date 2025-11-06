const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb, PDFName, PDFString } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const { finalizePdf } = require("../../Helpers/pdf-helpers");

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

// ---------------------
// Create base PDF with fonts + PDF/A-3b prep
// ---------------------
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

  // sanitize table & page content
  data.customerName = asciiSafe(data.customerName);
  data.companyName = asciiSafe(data.companyName);
  data.items.forEach(item => { item.name = asciiSafe(item.name); });

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



const metadataStream = pdfDoc.context.stream(Buffer.from(xmp, 'utf8'), {
  Type: PDFName.of('Metadata'),
  Subtype: PDFName.of('XML'),
});
pdfDoc.catalog.set(PDFName.of('Metadata'), pdfDoc.context.register(metadataStream));


  return Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
}

// ---------------------
// Create full ZUGFeRD PDF
// ---------------------
async function createShopifyInvoiceZugferd(order, shopConfig = {}) {
  // 1️⃣ Map order data
  const data = mapOrderToPdfData(order, shopConfig);

  // 2️⃣ Generate base PDF
  const pdfBuffer = await createBasePdf(data);

  // 3️⃣ Finalize PDF: embed XMP + ZUGFeRD XML
  const finalBuffer = await finalizePdf(pdfBuffer, data);

  // 4️⃣ Save PDF locally
  const outputDir = path.resolve(__dirname, "../Generated");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, `Invoice-ZUGFeRD-${data.orderId}.pdf`);
  fs.writeFileSync(outputPath, finalBuffer);

  console.log(`✅ Final ZUGFeRD PDF saved: ${outputPath}`);

  // 5️⃣ Return PDF buffer and path
  return { pdfPath: outputPath, pdfBuffer: finalBuffer };
}

module.exports = {
  createShopifyInvoiceZugferd,
  createBasePdf,
  mapOrderToPdfData
};
