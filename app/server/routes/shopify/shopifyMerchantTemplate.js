// shopifyMerchantTemplate.js
const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb, PDFName, PDFString } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const {
  generateZugferdXML,
  embedXmp,
  makePdfA3b,
} = require("../../Helpers/pdf-helpers");

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
    logoPath: shopConfig.logoPath, // optional logo
    companyName: shopConfig.companyName || "YOUR COMPANY GMBH",
  };
}

/** Draw table cell */
function drawCell(page, text, x, y, width, height, font, { size = 10, align = "left", bgColor } = {}) {
  if (bgColor)
    page.drawRectangle({ x, y, width, height, color: bgColor });
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: rgb(0.8, 0.8, 0.8),
    borderWidth: 0.5,
  });
  let textX = x + 4;
  if (align === "right")
    textX = x + width - text.length * size * 0.5 - 4;
  page.drawText(text, {
    x: textX,
    y: y + height / 4,
    size,
    font,
    color: rgb(0, 0, 0),
  });
}

/** Save XML both server-side and next to PDF for inspection */
function saveZugferdXmlForInspection(xmlContent, orderId, pdfOutputPath) {
  try {
    if (!xmlContent) {
      console.warn("⚠️ No XML content provided for inspection.");
      return;
    }

    const safeOrderId = (orderId || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
    const xmlFileName = `ZUGFeRD-${safeOrderId}.xml`;

    // Save in server folder
    const generatedDir = path.resolve(__dirname, "../Generated");
    if (!fs.existsSync(generatedDir))
      fs.mkdirSync(generatedDir, { recursive: true });
    const serverFilePath = path.join(generatedDir, xmlFileName);
    fs.writeFileSync(serverFilePath, xmlContent, "utf8");
    console.log(`✅ ZUGFeRD XML saved for inspection: ${serverFilePath}`);

    // Also next to PDF
    if (pdfOutputPath) {
      const pdfDir = path.dirname(pdfOutputPath);
      const clientXmlPath = path.join(pdfDir, xmlFileName);
      fs.writeFileSync(clientXmlPath, xmlContent, "utf8");
      console.log(`✅ ZUGFeRD XML saved next to PDF: ${clientXmlPath}`);
    }
  } catch (err) {
    console.error("⚠️ Failed to save ZUGFeRD XML:", err.message);
  }
}

/** Attach ZUGFeRD XML after PDF/A-3b conversion */
async function attachZugferdAfterPdfA3b(pdfBuffer, xmlContent) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const xmlBytes = Buffer.from(xmlContent, "utf8");

  const xmlStream = pdfDoc.context.flateStream(xmlBytes, {
    Type: PDFName.of("EmbeddedFile"),
    Subtype: PDFName.of("text#2Fxml"),
  });
  const xmlStreamRef = pdfDoc.context.register(xmlStream);

  const fileSpecDict = pdfDoc.context.obj({
    Type: PDFName.of("Filespec"),
    F: PDFString.of("ZUGFeRD-invoice.xml"),
    UF: PDFString.of("ZUGFeRD-invoice.xml"),
    AFRelationship: PDFName.of("Alternative"),
    EF: pdfDoc.context.obj({ F: xmlStreamRef }), 
  });

  const fileSpecRef = pdfDoc.context.register(fileSpecDict);

  pdfDoc.catalog.set(PDFName.of("AF"), pdfDoc.context.obj([fileSpecRef]));

  const embeddedFilesDict = pdfDoc.context.obj({
    Names: [PDFString.of("ZUGFeRD-invoice.xml"), fileSpecRef],
  });
  pdfDoc.catalog.set(PDFName.of("Names"), pdfDoc.context.obj({ EmbeddedFiles: embeddedFilesDict }));

  return Buffer.from(await pdfDoc.save());
}


/** Generate Shopify invoice PDF with Amazon-style layout and ZUGFeRD 2.3 Comfort */
async function createShopifyInvoiceZugferd(order, shopConfig = {}) {
  const data = mapOrderToPdfData(order, shopConfig);
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  // Load fonts
  const regularFontBytes = fs.readFileSync(
    path.resolve(__dirname, "../../../templates/fonts/LiberationSans-Regular.ttf")
  );
  const boldFontBytes = fs.readFileSync(
    path.resolve(__dirname, "../../../templates/fonts/LiberationSans-Bold.ttf")
  );
  const regularFont = await pdfDoc.embedFont(regularFontBytes);
  const boldFont = await pdfDoc.embedFont(boldFontBytes);

  const page = pdfDoc.addPage([595, 842]);
  let y = 780;
  const lineHeight = 24;
  const rowHeight = 24;
  const colWidths = [180, 60, 80, 80, 80];
  const headers = ["Item", "Qty", "Price", "Tax", "Total"];

  // Header bar with color background
  page.drawRectangle({
    x: 0,
    y: 780,
    width: 595,
    height: 40,
    color: rgb(0.18, 0.31, 0.61), // Amazon-like blue
  });

  // Logo and company name in header
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

  // Invoice header info
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

  // Table headers with light background
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
    drawCell(
      page,
      label,
      50,
      y,
      400,
      rowHeight,
      boldFont,
      {
        size: label === "Total" ? 12 : 10,
        align: "right",
        bgColor: i === 2 ? rgb(0.95, 0.95, 1) : undefined,
      }
    );
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

  await embedXmp(pdfDoc);
  const pdfBytes = await pdfDoc.save();
const pdfA3bBuffer = await makePdfA3b(Buffer.from(pdfBytes));


  // Generate and save XML (ZUGFeRD 2.3 Comfort)
  const xmlContent = generateZugferdXML({
    ...data,
    source: "shopify",
    currency: data.currency,
  });

  const pdfOutputPath = path.resolve(
    __dirname,
    `../Generated/Invoice-${data.orderId}.pdf`
  );
  saveZugferdXmlForInspection(xmlContent, data.orderId, pdfOutputPath);

  // Attach XML
  const finalBuffer = await attachZugferdAfterPdfA3b(pdfA3bBuffer, xmlContent);


  // Save final PDF
  fs.writeFileSync(pdfOutputPath, finalBuffer);
  console.log(`✅ Final PDF saved at: ${pdfOutputPath}`);

 return { pdfBuffer: finalBuffer, xmlContent }; 

}

module.exports = { createShopifyInvoiceZugferd };
