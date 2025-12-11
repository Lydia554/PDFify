const fs = require("fs");
const path = require("path");
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
// Create Merchant PDF
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
      tagged: true,
    });
    await browser.close();

    // 3. Finalize the PDF with PDF/A-3b compliance and ZUGFeRD embedding
    const finalPdfBuffer = await finalizePdf(puppeteerPdfBuffer, invoiceData);

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
