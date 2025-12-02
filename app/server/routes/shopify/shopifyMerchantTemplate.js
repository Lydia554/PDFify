const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { finalizePdf } = require("../../Helpers/pdf-helpers");
const puppeteer = require("puppeteer"); 
const { generateInvoiceHTML } = require("./merchantInvoice"); 

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
// Create Merchant PDF: PDFBox + Ghostscript
// ---------------------
async function createMerchantPdf(invoiceData) {
  console.log("🚀 STARTING NEW PUPPETEER-BASED PDF GENERATION (v-final - Skip PDFBox) 🚀");
  console.log("🟢 Starting createMerchantPdf");

  try {
    // 1. Generate HTML for the invoice
    const html = await generateInvoiceHTML(invoiceData);

    // 2. Launch Puppeteer and generate a standard PDF
    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const puppeteerPdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: 40, bottom: 40, left: 40, right: 40 },
    });
    await browser.close();

    // 3. Embed ZUGFeRD XML using pdf-lib
    const prePdfBuffer = await finalizePdf(puppeteerPdfBuffer, invoiceData);

    // 4. Setup temp directories and files
    const tmpDir = path.join(__dirname, "../../tmp_gs");
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpInput = path.join(tmpDir, `input-${Date.now()}.pdf`);
    fs.writeFileSync(tmpInput, prePdfBuffer);

    // 5. Run Ghostscript to enforce PDF/A compliance
    const tmpGsOutput = path.join(tmpDir, `gs-out-${Date.now()}.pdf`);
    const iccProfilePath =
      process.env.ICC_PROFILE_PATH && fs.existsSync(process.env.ICC_PROFILE_PATH)
        ? process.env.ICC_PROFILE_PATH
        : "/usr/share/color/icc/ghostscript/srgb.icc";

    console.log("🟢 Running Ghostscript to enforce PDF/A-3b...");
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
        `-sOutputFile=${tmpGsOutput}`,
        tmpInput, 
      ],
      { encoding: "utf8" }
    );

    if (gs.error || gs.status !== 0) {
      console.error("❌ Ghostscript failed:", gs.error || gs.stderr);
      throw new Error(`Ghostscript PDF/A-3b conversion failed: ${gs.stderr}`);
    }
    console.log("✅ Ghostscript conversion successful. Returning this PDF.");

    // 6. PDFBox step is SKIPPED as a workaround for the Java classpath error.
    
    return fs.readFileSync(tmpGsOutput);
  } catch (err) {
    console.error("❌ createMerchantPdf failed:", err);
    throw err;
  }
}

module.exports = {
  mapOrderToPdfData,
  createMerchantPdf, 
};