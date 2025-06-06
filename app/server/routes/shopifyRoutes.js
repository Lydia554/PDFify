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
  let logoHtml = '';
  let chartHtml = '';

  if (isPremium && invoiceData.customLogoUrl) {
    logoHtml = `<img src="${invoiceData.customLogoUrl}" alt="Logo" style="max-height:60px; margin-bottom: 20px;" />`;
  }

  if (isPremium && invoiceData.showChart) {
    chartHtml = `<div style="margin-top: 30px;"><i>[Premium Sales Chart Placeholder]</i></div>`;
  }

  const itemsHtml = (invoiceData.items || []).map(item => `
    <tr>
      <td>${item.name || 'Item'}</td>
      <td>${item.quantity || 1}</td>
      <td>€${item.price?.toFixed(2) || '0.00'}</td>
    </tr>
  `).join('') || '<tr><td colspan="3">No items</td></tr>';

  return `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; }
          h1 { margin-bottom: 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
          .total { text-align: right; font-weight: bold; margin-top: 20px; }
          .logo { margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="logo">${logoHtml}</div>
        <h1>Invoice</h1>
        <p><strong>Shop:</strong> ${invoiceData.shopName || 'Unnamed Shop'}</p>
        <p><strong>Date:</strong> ${invoiceData.date || new Date().toISOString().slice(0, 10)}</p>
        <table>
          <thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <p class="total">Total: €${(invoiceData.total || 0).toFixed(2)}</p>
        ${chartHtml}
      </body>
    </html>
  `;
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
    // 🔒 Force premium always
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
      showChart: shopConfig?.showChart,
      customLogoUrl: shopConfig?.customLogoUrl || null,
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
        "Content-Disposition": "inline",
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
