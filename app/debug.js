const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const { convertToPdfA3b_v2 } = require("./server/Helpers/pdf-helpers");
const fontkit = require("@pdf-lib/fontkit");
const { PDFDocument, PDFName, PDFHexString } = require("pdf-lib");
const generateZugferdXml = require("./xml/generateZugferdXml");

const debugDir = path.join(__dirname, "debug_steps_pdfa_test");
fs.mkdirSync(debugDir, { recursive: true });

// Mock invoice data for testing
const mockInvoiceData = {
  orderId: "DEBUG-123",
  date: new Date().toISOString().slice(0, 10),
  customerName: "Debug Customer Inc.",
  items: [
    {
      position: 1,
      name: "Test Product A",
      quantity: 2,
      unitCode: "EA",
      price: 50.0,
      net: 100.0,
      tax: 20.0,
      total: 120.0,
      taxRate: 20,
      currency: "EUR",
    },
  ],
  subtotal: 100.0,
  tax: 20.0,
  total: 120.0,
  vatRate: 20,
  currency: "EUR",
  iban: "DE89370400440532013000",
  bic: "COBADEFFXXX",
  paymentTerms: "Due within 14 days",
  creator: "PDFify Debug",
  companyName: "PDFify Corp",
  locale: { language: "en" },
};

/**
 * A clean, end-to-end test of the pdf-lib based conversion process.
 * 1. Generate a standard PDF with Puppeteer.
 * 2. Convert it to PDF/A-3b + ZUGFeRD using our helper.
 * 3. Save the result for validation.
 */
async function testPdfLibConversion() {
  console.log("🚀 Starting pdf-lib conversion test...");

  try {
    // 1. Generate a basic PDF from HTML using Puppeteer
    console.log("🟢 Step 1: Generating base PDF with Puppeteer...");
    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage();
    const html = `<html><body><h1>Invoice ${mockInvoiceData.orderId}</h1><p>This is a test document.</p></body></html>`;
    await page.setContent(html, { waitUntil: "networkidle0" });
    const puppeteerPdfBuffer = await page.pdf({ format: "A4", printBackground: true });
    await browser.close();
    console.log("✅ Base PDF generated.");

    // 2. Convert to PDF/A-3b using the dedicated helper
    console.log("🟢 Step 2: Converting to PDF/A-3b with convertToPdfA3b_v2 helper...");
    const finalPdfBuffer = await convertToPdfA3b_v2(puppeteerPdfBuffer, mockInvoiceData);
    console.log("✅ Conversion helper finished.");

    // 3. Save the final PDF for validation
    const outputPath = path.join(debugDir, "debug_pdflib_output.pdf");
    fs.writeFileSync(outputPath, finalPdfBuffer);
    console.log(`\n✅ DONE. Final PDF saved to: ${outputPath}`);
    console.log("👉 Please validate this file with a PDF/A validator like VeraPDF.");

  } catch (err) {
    console.error("❌ Test failed:", err);
  }
}

testPdfLibConversion();
