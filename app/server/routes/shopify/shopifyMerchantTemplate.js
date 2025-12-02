const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { generatePdfA3bXmp } = require("../../Helpers/pdf-helpers");
const generateZugferdXml = require("../../../xml/generateZugferdXml");
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
// Create Merchant PDF: Ghostscript Only
// ---------------------
async function createMerchantPdf(invoiceData) {
  console.log("🚀 STARTING GHOSTSCRIPT-ONLY PDF GENERATION (v2) 🚀");

  const tmpDir = path.join(__dirname, "../../tmp_gs");
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // 1. Generate HTML
    const html = await generateInvoiceHTML(invoiceData);

    // 2. Generate standard PDF with Puppeteer
    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const puppeteerPdfBuffer = await page.pdf({ format: "A4", printBackground: true, margin: { top: 40, bottom: 40, left: 40, right: 40 } });
    await browser.close();
    
    const tmpInput = path.join(tmpDir, `input-${Date.now()}.pdf`);
    fs.writeFileSync(tmpInput, puppeteerPdfBuffer);

    // 3. Generate XMP and ZUGFeRD XML
    const xmpString = generatePdfA3bXmp(invoiceData);
    const xmpFile = path.join(tmpDir, "metadata.xmp");
    fs.writeFileSync(xmpFile, xmpString);

    const zugferdXmlString = generateZugferdXml(invoiceData);
    const zugferdXmlFile = path.join(tmpDir, "factur-x.xml");
    fs.writeFileSync(zugferdXmlFile, zugferdXmlString);
    
    // 4. Create pdfmark file for Ghostscript
    const pdfMarkFile = path.join(tmpDir, "pdfmark.ps");
    const pdfMarkContent = `
[ /Subtype /XML /MetadataFile (${xmpFile.replace(/\\/g, '/')}) /PUT pdfmark
[ /F (factur-x.xml) /UF (factur-x.xml) /Desc (ZUGFeRD Invoice) /AFRelationship /Alternative /FS file (${zugferdXmlFile.replace(/\\/g, '/')}) ] /PUT pdfmark
`;
    fs.writeFileSync(pdfMarkFile, pdfMarkContent);
    
    // 5. Run Ghostscript
    const tmpGsOutput = path.join(tmpDir, `gs-out-${Date.now()}.pdf`);
    const iccProfilePath = path.resolve(__dirname, "../../Helpers/sRGB2014.icc");

    console.log("🟢 Running Ghostscript to enforce PDF/A-3b and embed files...");
    const gs = spawnSync(
      "gs",
      [
        "-dPDFA=3",
        "-dPDFACompatibilityPolicy=1",
        "-sDEVICE=pdfwrite",
        "-dBATCH",
        "-dNOPAUSE",
        "-dNOSAFER",
        "-sColorConversionStrategy=UseDeviceIndependentColor",
        "-sProcessColorModel=DeviceRGB",
        `-sOutputICCProfile=${iccProfilePath.replace(/\\/g, '/')}`,
        `-sOutputFile=${tmpGsOutput.replace(/\\/g, '/')}`,
        tmpInput.replace(/\\/g, '/'),
        pdfMarkFile.replace(/\\/g, '/'),
      ],
      { encoding: "utf8" }
    );

    if (gs.error || gs.status !== 0) {
      console.error("❌ Ghostscript failed:", gs.stderr || gs.error);
      throw new Error(`Ghostscript PDF generation failed: ${gs.stderr || 'Unknown error'}`);
    }
    
    console.log("✅ Ghostscript conversion successful.");
    const finalPdfBuffer = fs.readFileSync(tmpGsOutput);
    
    // Cleanup
    fs.unlinkSync(tmpInput);
    fs.unlinkSync(xmpFile);
    fs.unlinkSync(zugferdXmlFile);
    fs.unlinkSync(pdfMarkFile);
    fs.unlinkSync(tmpGsOutput);

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
