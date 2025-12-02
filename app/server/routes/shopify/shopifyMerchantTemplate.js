const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { generatePdfA3bXmp, embedZugferdXml } = require("../../Helpers/pdf-helpers");
const { PDFDocument } = require("pdf-lib");
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
  console.log("🚀 STARTING NEW PUPPETEER-BASED PDF GENERATION (v8 - Graceful Fallback) 🚀");
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

    // 3. Setup temp directories and files
    const tmpDir = path.join(__dirname, "../../tmp_gs");
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpInput = path.join(tmpDir, `input-${Date.now()}.pdf`);
    fs.writeFileSync(tmpInput, puppeteerPdfBuffer);

    // 4. Generate and write XMP metadata
    const xmpString = generatePdfA3bXmp(invoiceData);
    const xmpFile = path.join(tmpDir, "metadata.xmp");
    fs.writeFileSync(xmpFile, xmpString);

    // 5. Generate and write pdfmark
    const pdfMarkFile = path.join(tmpDir, "pdfmark.ps");
    const pdfMarkContent = `[ /Subtype /XML /MetadataFile (${xmpFile}) /DOCINFO pdfmark`;
    fs.writeFileSync(pdfMarkFile, pdfMarkContent);
    
    // 6. Run Ghostscript to enforce PDF/A compliance and embed XMP
    const tmpGsOutput = path.join(tmpDir, `gs-out-${Date.now()}.pdf`);
    const iccProfilePath =
      process.env.ICC_PROFILE_PATH && fs.existsSync(process.env.ICC_PROFILE_PATH)
        ? process.env.ICC_PROFILE_PATH
        : path.resolve(__dirname, "../../Helpers/sRGB2014.icc");

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
        pdfMarkFile, // Embed the metadata
      ],
      { encoding: "utf8" }
    );

    if (gs.error || gs.status !== 0) {
      console.error("❌ Ghostscript failed:", gs.error || gs.stderr);
      throw new Error(`Ghostscript PDF/A-3b conversion failed: ${gs.stderr}`);
    }
    console.log("✅ Ghostscript conversion successful.");

    // 7. Embed ZUGFeRD XML by rebuilding the PDF with pdf-lib
    const gsPdfBuffer = fs.readFileSync(tmpGsOutput);
    
    // Create a new document and copy pages from the Ghostscript output
    const pdfDoc = await PDFDocument.create();
    const sourcePdf = await PDFDocument.load(gsPdfBuffer);
    const copiedPages = await pdfDoc.copyPages(sourcePdf, sourcePdf.getPageIndices());
    copiedPages.forEach((page) => pdfDoc.addPage(page));

    // Embed the ZUGFeRD XML into the new document
    await embedZugferdXml(pdfDoc, invoiceData);
    
    // Save the newly constructed document
    const finalPdfBuffer = await pdfDoc.save();

    console.log("✅ PDF/A-3b generation with ZUGFeRD complete. Returning final PDF.");
    return finalPdfBuffer;
    
  } catch (err) {
    console.error("❌ createMerchantPdf failed:", err);
    throw err;
  }
}

module.exports = {
  mapOrderToPdfData,
  createMerchantPdf, 
};
