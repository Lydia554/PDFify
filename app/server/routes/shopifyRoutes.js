const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const ShopConfig = require("../models/ShopConfig");
const { generateInvoiceHTML } = require("./routes/invoiceRoutes");


 
const router = express.Router();
router.post("/shopify-invoice", async (req, res) => {
    try {
      let { shopDomain, orderData, isPreview } = req.body;
  
      if (!shopDomain || typeof orderData !== "object") {
        return res.status(400).json({ error: "Missing shop domain or order data." });
      }
  
      let config = await ShopConfig.findOne({ shopDomain });
      if (!config) {
        return res.status(404).json({ error: "Shop not configured." });
      }
  
      const invoiceData = { ...orderData };
  
      // Fallback/default for items
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
  
      // Apply shop settings
      if (!config.isPremium) {
        invoiceData.customLogoUrl = null;
        invoiceData.showChart = false;
      } else {
        invoiceData.customLogoUrl = config.customLogoUrl;
        invoiceData.showChart = config.showChart;
      }
  
      // HERE: generate html AFTER invoiceData and config are ready
      const html = generateInvoiceHTML(invoiceData, {
        premium: config.isPremium,
        customLogo: invoiceData.customLogoUrl,
        showChart: invoiceData.showChart,
        theme: config.theme || "default",
      });
  
      const safeOrderId = invoiceData.orderId || `preview-${Date.now()}`;
      const pdfDir = path.join(__dirname, "../pdfs");
      if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
  
      const pdfPath = path.join(pdfDir, `Shopify_Invoice_${safeOrderId}.pdf`);
      const browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--single-process",
          "--disable-gpu"
        ],
      });
      
      const page = await browser.newPage();
  
      await page.setContent(html, { waitUntil: "networkidle0" });
      await page.pdf({ path: pdfPath, format: "A4" });
      await browser.close();
  
      const pdfBuffer = fs.readFileSync(pdfPath);
  
      if (!isPreview) {
        // Optional: log usage, billing etc.
      }
  
      res.download(pdfPath, (err) => {
        fs.unlinkSync(pdfPath); // Cleanup
      });
  
    } catch (err) {
      console.error("Shopify PDF generation failed:", err);
      res.status(500).json({ error: "Failed to generate invoice." });
    }
  });
  

  module.exports = router;