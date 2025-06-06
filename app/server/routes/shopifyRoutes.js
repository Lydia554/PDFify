const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const ShopConfig = require("../models/ShopConfig");

const router = express.Router();

function generateInvoiceHTML(data) {
  // You can reuse or import your invoice HTML generator here
  // To avoid duplication, consider exporting it from a shared file
  // e.g., move the function into utils/invoiceTemplate.js
  // For now, let's assume you’ll import or paste it here
}

router.post("/shopify/invoice", async (req, res) => {
  console.log("Request headers:", req.headers);
  try {
    const shopDomain = req.headers["x-shopify-shop-domain"];
    if (!shopDomain) {
      return res.status(400).json({ error: "Missing shop domain" });
    }

    const order = req.body;
    if (!order || !order.id || !order.line_items) {
      return res.status(400).json({ error: "Invalid order payload" });
    }

    const shopConfig = await ShopConfig.findOne({ shopDomain });
    const isPremium = shopConfig?.isPremium || false;

    const invoiceData = {
      orderId: order.id,
      date: new Date(order.created_at).toLocaleDateString(),
      customerName: `${order.customer.first_name} ${order.customer.last_name}`,
      customerEmail: order.contact_email || order.email,
      subtotal: `${(order.subtotal_price || 0)}€`,
      tax: `${(order.total_tax || 0)}€`,
      total: `${(order.total_price || 0)}€`,
      items: order.line_items.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: `${item.price}€`,
        total: `${item.price * item.quantity}€`
      })),
      showChart: isPremium && shopConfig?.showChart,
      customLogoUrl: isPremium ? shopConfig?.customLogoUrl : null,
    };

    const safeOrderId = `shopify-${order.id}`;
    const pdfDir = path.join(__dirname, "../pdfs");
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir);

    const pdfPath = path.join(pdfDir, `Invoice_${safeOrderId}.pdf`);

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();

    const html = generateInvoiceHTML(invoiceData);
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({ path: pdfPath, format: "A4" });
    await browser.close();

    // Optional: usage tracking (if you track shops like users)

    const pdfBuffer = fs.readFileSync(pdfPath);
    const parsed = await pdfParse(pdfBuffer);
    const pageCount = parsed.numpages;

    // Option 1: Send the file directly
    res.download(pdfPath, (err) => {
      fs.unlinkSync(pdfPath); // Clean up after download
    });

    // Option 2: Host and respond with a link
    // const publicUrl = `https://your-api.com/static/invoices/Invoice_${safeOrderId}.pdf`;
    // res.json({ pdfUrl: publicUrl });

  } catch (error) {
    console.error("Shopify invoice generation error:", error);
    res.status(500).json({ error: "PDF generation failed" });
  }
});

module.exports = router;
