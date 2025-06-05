const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const ShopConfig = require("../models/ShopConfig");
const { generateInvoiceHTML } = require("./routes/invoiceRoutes");


 
const router = express.Router();


router.post("/shopify-invoice", async (req, res) => {
  try {
    console.log("➡️ New request received");
    let { shopDomain, orderData, isPreview } = req.body;

    if (!shopDomain || typeof orderData !== "object") {
      console.log("❌ Invalid input data");
      return res.status(400).json({ error: "Missing shop domain or order data." });
    }

    let config = await ShopConfig.findOne({ shopDomain });
    if (!config) {
      console.log("❌ Shop config not found");
      return res.status(404).json({ error: "Shop not configured." });
    }

    const invoiceData = { ...orderData };

    if (typeof invoiceData.items === "string") {
      try {
        invoiceData.items = JSON.parse(invoiceData.items);
      } catch {
        invoiceData.items = [];
      }
    }

    if (!Array.isArray(invoiceData.items)) {
      invoiceData.items = [];
    }

    // Apply config
    invoiceData.customLogoUrl = config.isPremium ? config.customLogoUrl : null;
    invoiceData.showChart = config.isPremium ? config.showChart : false;

    console.log("✅ Data ready, generating HTML");

    const html = generateInvoiceHTML(invoiceData, {
      premium: config.isPremium,
      customLogo: invoiceData.customLogoUrl,
      showChart: invoiceData.showChart,
      theme: config.theme || "default",
    });

    console.log("✅ HTML generated");

    const safeOrderId = invoiceData.orderId || `preview-${Date.now()}`;
    const pdfDir = path.join(__dirname, "../pdfs");

    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
      console.log("📂 Created pdf directory");
    }

    const pdfPath = path.join(pdfDir, `Shopify_Invoice_${safeOrderId}.pdf`);

    const browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--single-process",
        "--disable-gpu"
      ]
    });

    const page = await browser.newPage();
    console.log("🧭 Setting page content");
    await page.setContent(html, { waitUntil: "networkidle0" });

    console.log("📄 Generating PDF");
    await page.pdf({ path: pdfPath, format: "A4" });
    await browser.close();

    console.log("✅ PDF created, reading file");

    const pdfBuffer = fs.readFileSync(pdfPath);

    res.download(pdfPath, (err) => {
      fs.unlinkSync(pdfPath); // Cleanup
      console.log("🚀 Sent PDF and deleted temp file");
    });

  } catch (err) {
    console.error("🔥 Shopify PDF generation failed:", err);
    res.status(500).json({ error: "Failed to generate invoice." });
  }
});


  module.exports = router;