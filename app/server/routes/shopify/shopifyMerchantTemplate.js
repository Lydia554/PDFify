const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { PDFDocument, rgb, PDFName } = require("pdf-lib");
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
// Create minimal PDF (Ghostscript-safe)
// ---------------------
async function createBasePdf(data) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const regularFontBytes = fs.readFileSync(path.resolve(__dirname, "../../../templates/fonts/LiberationSans-Regular.ttf"));
  const boldFontBytes = fs.readFileSync(path.resolve(__dirname, "../../../templates/fonts/LiberationSans-Bold.ttf"));
  const regularFont = await pdfDoc.embedFont(regularFontBytes);
  const boldFont = await pdfDoc.embedFont(boldFontBytes);

  // ---------------------
  // Create page and draw invoice content only
  // ---------------------
  const page = pdfDoc.addPage([595, 842]);
  let y = 780;
  const rowHeight = 24;
  const colWidths = [180, 60, 80, 80, 80];
  const headers = ["Item", "Qty", "Price", "Tax", "Total"];

  const asciiSafe = (str) => (str ? str.replace(/[^\x20-\x7E]/g, "") : " ");
  data.customerName = asciiSafe(data.customerName);
  data.companyName = asciiSafe(data.companyName);
  data.items.forEach((i) => (i.name = asciiSafe(i.name)));

  // Header rectangle + text
  page.drawRectangle({ x: 0, y: 780, width: 595, height: 40, color: rgb(0.18, 0.31, 0.61) });
  page.drawText(String(data.companyName), { x: 220, y: 794, size: 16, font: boldFont, color: rgb(1, 1, 1) });
  page.drawText(`INVOICE #${String(data.orderId)}`, { x: 50, y, size: 18, font: boldFont, color: rgb(0.2, 0.2, 0.7) });

  // Table
  y -= 70;
  let x = 50;
  headers.forEach((header, i) => {
    page.drawText(asciiSafe(header), { x, y, size: 10, font: boldFont });
    x += colWidths[i];
  });
  y -= rowHeight;

  data.items.forEach((item) => {
    let x = 50;
    const row = [item.name, String(item.quantity), item.price.toFixed(2), item.tax.toFixed(2), item.total.toFixed(2)];
    row.forEach((cell, i) => {
      page.drawText(cell, { x, y, size: 10, font: regularFont });
      x += colWidths[i];
    });
    y -= rowHeight;
  });

  return Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
}

// ---------------------
// Create Merchant PDF (Ghostscript + ZUGFeRD compliant XMP)
// ---------------------
async function createMerchantPdf(invoiceData) {
  console.log("🟢 Starting createMerchantPdf");

  // 1️⃣ Minimal base PDF
  let pdfBuffer;
  try {
    pdfBuffer = await createBasePdf(invoiceData);
  } catch (err) {
    console.error("❌ createBasePdf failed:", err);
    throw err;
  }

  const tmpDir = path.join(__dirname, "../../tmp_gs");
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmpInput = path.join(tmpDir, `input-${Date.now()}.pdf`);
  const tmpOutput = path.join(tmpDir, `output-${Date.now()}.pdf`);
  fs.writeFileSync(tmpInput, pdfBuffer);

  // 2️⃣ Ghostscript: enforce PDF/A-3B
  const iccProfilePath =
    process.env.ICC_PROFILE_PATH && fs.existsSync(process.env.ICC_PROFILE_PATH)
      ? process.env.ICC_PROFILE_PATH
      : "/usr/share/color/icc/ghostscript/srgb.icc";

  const gs = spawnSync(
    "gs",
    [
      "-dPDFA=3",
      "-dPDFACompatibilityPolicy=1",
      "-sDEVICE=pdfwrite",
      "-dNOPAUSE",
      "-dBATCH",
      "-dNOSAFER",
      "-dEmbedAllFonts=true",
      "-dSubsetFonts=true",
      "-dCompressFonts=true",
      "-dUseCIEColor",
      "-dProcessColorModel=/DeviceRGB",
      "-sColorConversionStrategy=RGB",
      `-sOutputICCProfile=${iccProfilePath}`,
      `-sOutputFile=${tmpOutput}`,
      tmpInput,
    ],
    { encoding: "utf-8" }
  );

  if (gs.error || gs.status !== 0) {
    console.error("❌ Ghostscript failed:", gs.error || gs.stderr);
    throw new Error(`Ghostscript PDF/A-3b conversion failed: ${gs.stderr}`);
  }

  pdfBuffer = fs.readFileSync(tmpOutput);

  // 3️⃣ Inject fully compliant ZUGFeRD XMP after Ghostscript
  try {
    const zugferdData = await finalizePdf(pdfBuffer, invoiceData); 
    pdfBuffer = Buffer.from(zugferdData);
  } catch (err) {
    console.error("❌ finalizePdf failed:", err);
    throw err;
  }

  return pdfBuffer;
}

module.exports = {
  mapOrderToPdfData,
  createBasePdf,
  createMerchantPdf,
  finalizePdf
};
