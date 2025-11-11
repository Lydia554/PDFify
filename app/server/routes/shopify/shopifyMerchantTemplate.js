const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { PDFDocument, rgb } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const { cleanPdfBuffer, embedZugferdXml, finalizePdf } = require("../../Helpers/pdf-helpers");

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
// Create minimal PDF
// ---------------------
async function createBasePdf(data) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const regularFontBytes = fs.readFileSync(path.resolve(__dirname, "../../../templates/fonts/LiberationSans-Regular.ttf"));
  const boldFontBytes = fs.readFileSync(path.resolve(__dirname, "../../../templates/fonts/LiberationSans-Bold.ttf"));
  const regularFont = await pdfDoc.embedFont(regularFontBytes);
  const boldFont = await pdfDoc.embedFont(boldFontBytes);

  const page = pdfDoc.addPage([595, 842]);
  let y = 780;
  const rowHeight = 24;
  const colWidths = [180, 60, 80, 80, 80];
  const headers = ["Item", "Qty", "Price", "Tax", "Total"];

  const asciiSafe = (str) => (str ? str.replace(/[^\x20-\x7E]/g, "") : " ");
  data.customerName = asciiSafe(data.customerName);
  data.companyName = asciiSafe(data.companyName);
  data.items.forEach((i) => (i.name = asciiSafe(i.name)));

  // Header
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

  return pdfDoc;
}

// ---------------------
// Create Merchant PDF: PDFBox + Ghostscript
// ---------------------
async function createMerchantPdf(invoiceData) {
  console.log("🟢 Starting createMerchantPdf");

  try {
    //  Create base PDF and embed ZUGFeRD XML
    const pdfDoc = await createBasePdf(invoiceData);
    await embedZugferdXml(pdfDoc, invoiceData);
    const prePdfBuffer = await pdfDoc.save({ useObjectStreams: false });

    //  Write temp file for PDFBox
    const tmpDir = path.join(__dirname, "../../tmp_gs");
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpInput = path.join(tmpDir, `input-${Date.now()}.pdf`);
    fs.writeFileSync(tmpInput, prePdfBuffer);

// PDFBox Preflight (PDFBox 3.x Preflight jar)
const pdfboxJar = process.env.PDFBOX_JAR_PATH
  ? path.resolve(process.env.PDFBOX_JAR_PATH)
  : "/app/lib/preflight-app-3.0.6.jar";



const tmpPdfBoxOutput = path.join(tmpDir, `pdfbox-out-${Date.now()}.pdf`);
console.log("🟢 Running PDFBox Preflight on:", tmpInput);
console.log("🟢 Using PDFBox JAR:", pdfboxJar);

const pdfBoxCmd = spawnSync(
  "java",
  [
    "-jar",
    pdfboxJar,
    "-a",         
    tmpInput,     
    "-o",
    tmpPdfBoxOutput 
  ],
  { encoding: "utf8" }
);



    console.log("📄 PDFBox stdout:", pdfBoxCmd.stdout);
    console.log("📄 PDFBox stderr:", pdfBoxCmd.stderr);

    if (pdfBoxCmd.error || pdfBoxCmd.status !== 0) {
      console.error("❌ PDFBox Preflight failed:", pdfBoxCmd.error || pdfBoxCmd.stderr);
      throw new Error(`PDFBox processing failed: ${pdfBoxCmd.stderr}`);
    }

    if (!fs.existsSync(tmpPdfBoxOutput) || fs.statSync(tmpPdfBoxOutput).size === 0) {
      throw new Error("PDFBox did not produce a valid output PDF.");
    }

    console.log("✅ PDFBox Preflight completed, output:", tmpPdfBoxOutput);

    // 4️⃣ Ghostscript PDF/A-3B enforcement
    const tmpOutput = path.join(tmpDir, `output-${Date.now()}.pdf`);
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
    "-dBATCH",
    "-dNOPAUSE",
    "-dNOSAFER",
    "-dEmbedAllFonts=true",
    "-dSubsetFonts=true",
    "-dCompressFonts=true",
    "-sColorConversionStrategy=UseDeviceIndependentColor",
    "-sProcessColorModel=DeviceRGB",
    `-sOutputICCProfile=${iccProfilePath}`,
    `-sOutputFile=${tmpOutput}`,
    tmpPdfBoxOutput,
  ],
  { encoding: "utf8" } 
);

    if (gs.error || gs.status !== 0) {
      console.error("❌ Ghostscript failed:", gs.error || gs.stderr);
      throw new Error(`Ghostscript PDF/A-3b conversion failed: ${gs.stderr}`);
    }

    // Return final PDF buffer
    return fs.readFileSync(tmpOutput);
  } catch (err) {
    console.error("❌ createMerchantPdf failed:", err);
    throw err;
  }
}

module.exports = {
  mapOrderToPdfData,
  createBasePdf,
  createMerchantPdf,
};
