const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const ShopConfig = require("../models/ShopConfig");
const User = require("../models/User"); 
const authenticate = require("../middleware/authenticate"); 

const router = express.Router();
function generateInvoiceHTML(invoiceData, isPremium) {
  const { shopName, date, items = [], total, customLogoUrl, showChart } = invoiceData;

  const itemsHtml = items.length
    ? items.map(item => `
      <tr>
        <td>${item.name}</td>
        <td>${item.quantity}</td>
        <td>€${item.price.toFixed(2)}</td>
      </tr>
    `).join('')
    : `<tr><td colspan="3">No items</td></tr>`;

  if (isPremium) {
    // --- PREMIUM STYLE ---
    return `
    <html>
      <head>
        <style>
          body { font-family: 'Helvetica Neue', sans-serif; padding: 50px; background: #f9f9fb; color: #333; }
          .logo img { max-height: 80px; margin-bottom: 25px; }
          h1 { color: #1e88e5; border-bottom: 2px solid #1e88e5; padding-bottom: 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 30px; }
          th, td { border: 1px solid #ddd; padding: 12px; font-size: 15px; }
          th { background-color: #e3f2fd; color: #0d47a1; }
          .total { text-align: right; font-size: 18px; font-weight: bold; margin-top: 30px; }
          .chart { margin-top: 40px; font-style: italic; color: #666; }
          footer { margin-top: 50px; font-size: 13px; text-align: center; color: #888; }
        </style>
      </head>
      <body>
        <div class="logo">
          ${customLogoUrl ? `<img src="${customLogoUrl}" alt="Shop Logo" />` : ''}
        </div>
        <h1>Premium Invoice</h1>
        <p><strong>Shop:</strong> ${shopName}</p>
        <p><strong>Date:</strong> ${date}</p>

        <table>
          <thead>
            <tr><th>Item</th><th>Quantity</th><th>Price (€)</th></tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>

        <p class="total">Total: €${total.toFixed(2)}</p>

        ${showChart ? `<div class="chart">📊 Premium sales chart will appear here</div>` : ''}

        <footer>Thank you for shopping with ${shopName}</footer>
      </body>
    </html>
    `;
  } else {
    // --- BASIC STYLE ---
    return `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; color: #000; background: #fff; }
          h1 { font-size: 22px; margin-bottom: 10px; border-bottom: 1px solid #000; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
          th, td { border: 1px solid #000; padding: 8px; }
          th { background-color: #eee; }
          .total { text-align: right; font-weight: bold; margin-top: 20px; }
          footer { margin-top: 40px; font-size: 11px; text-align: center; color: #555; }
        </style>
      </head>
      <body>
        <h1>Invoice</h1>
        <p><strong>Shop:</strong> ${shopName}</p>
        <p><strong>Date:</strong> ${date}</p>

        <table>
          <thead>
            <tr><th>Item</th><th>Quantity</th><th>Price (€)</th></tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>

        <p class="total">Total: €${total.toFixed(2)}</p>

        <footer>This is a basic invoice. Upgrade for more features!</footer>
      </body>
    </html>
    `;
  }
}

router.post("/shopify/invoice", authenticate, async (req, res) => {
  try {
    const shopDomain = req.headers["x-shopify-shop-domain"];
    if (!shopDomain) {
      return res.status(400).json({ error: "Missing shop domain" });
    }

    const order = req.body;
    if (!order || !order.id || !order.line_items) {
      return res.status(400).json({ error: "Invalid order payload" });
    }

    

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const shopConfig = await ShopConfig.findOne({ shopDomain });
    //const isPremium = user.isPremium && shopConfig?.isPremium;
    const isPremium = true;

    const invoiceData = {
      shopName: shopConfig?.shopName || shopDomain || 'Unnamed Shop',
      date: new Date(order.created_at).toISOString().slice(0, 10),
      items: order.line_items.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: Number(item.price) || 0,
      })),
      total: Number(order.total_price) || 0,
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
    const html = generateInvoiceHTML(invoiceData, isPremium);
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({ path: pdfPath, format: "A4" });
    await browser.close();

    const pdfBuffer = fs.readFileSync(pdfPath);
    const parsed = await pdfParse(pdfBuffer);
    const pageCount = parsed.numpages;

    const isPreview = req.query.preview === 'true';

    if (!isPreview) {
      if (user.usageCount + pageCount > user.maxUsage) {
        fs.unlinkSync(pdfPath);
        return res.status(403).json({
          error: "Monthly usage limit reached. Upgrade to premium for more pages.",
        });
      }

      user.usageCount += pageCount;
      await user.save();

      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=Invoice_${safeOrderId}.pdf`,
      });
    } else {
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline", // Preview in Postman/browser
      });
    }

    res.send(pdfBuffer);
    fs.unlinkSync(pdfPath);

  } catch (error) {
    console.error("Shopify invoice generation error:", error);
    res.status(500).json({ error: "PDF generation failed" });
  }
});

module.exports = router;