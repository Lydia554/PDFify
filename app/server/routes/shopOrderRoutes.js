const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const router = express.Router();
const fs = require("fs");
const authenticate = require("../middleware/authenticate");
const User = require("../models/User");
const pdfParse = require("pdf-parse");
const dualAuth = require('../middleware/dualAuth');

if (typeof ReadableStream === "undefined") {
  global.ReadableStream = require("web-streams-polyfill").ReadableStream;
}

function generateShopOrderHTML(data, isBasicUser = true, showWatermark = false) {
  // Logo only for basic (non-premium) users
  const logoHtml = isBasicUser
    ? `<img src="https://pdf-api.portfolio.lidija-jokic.com/images/Logo.png" alt="Company Logo" class="logo" style="max-width:150px; display:block; margin: 0 auto 20px auto;" />`
    : "";

  // Watermark only for basic users with showWatermark true (light gray rotated text)
  const watermarkHtml = showWatermark
    ? `<div style="
        position: fixed;
        top: 40%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(-30deg);
        color: rgba(200, 0, 0, 0.15);
        font-size: 48px;
        font-weight: 900;
        z-index: 9999;
        pointer-events: none;
        white-space: nowrap;
      ">
        PREVIEW ONLY – NOT FOR PRODUCTION USE
      </div>`
    : "";

  return `
    <html>
      <head>
        <style>
          body {
            font-family: 'Arial', sans-serif;
            padding: 40px;
            color: #333;
            background-color: #f9f9f9;
            margin: 0;
            box-sizing: border-box;
            position: relative;
          }
          h1 {
            text-align: center;
            color: #5e60ce;
            margin-bottom: 20px;
          }
          h2 {
            color: #2d2d2d;
          }
          p {
            line-height: 1.6;
            margin: 10px 0;
          }
          .section {
            margin-bottom: 20px;
            background-color: #ffffff;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
          }
          .label {
            font-weight: bold;
            color: #333;
          }
          .order-details {
            margin-top: 10px;
            border-top: 2px solid #5e60ce;
            padding-top: 20px;
          }
          .products-list {
            margin-top: 15px;
            padding: 10px;
            border-radius: 8px;
            background-color: #f4f7fb;
          }
          .products-list li {
            margin-bottom: 8px;
          }
          .total {
            font-size: 1.2em;
            font-weight: bold;
            color: #5e60ce;
          }
          .footer {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 20px;
            font-size: 12px;
            background-color: #f9f9f9;
            color: #444;
            border-top: 1px solid #ccc;
            text-align: center;
            line-height: 1.6;
          }
          .footer a {
            color: #0073e6;
            text-decoration: none;
          }
          .footer a:hover {
            text-decoration: underline;
          }
          @media (max-width: 600px) {
            body { padding: 20px; }
            h1 { font-size: 1.5em; }
            h2 { font-size: 1.2em; }
            .section { padding: 15px; }
            .products-list { padding: 8px; }
            .total { font-size: 1em; }
            .footer {
              font-size: 11px;
              padding: 15px 10px;
              line-height: 1.4;
            }
            .footer p { margin: 6px 0; }
            .footer a { word-break: break-word; }
          }
        </style>
      </head>
      <body>
        ${watermarkHtml}
        ${logoHtml}
        <h1>Shop Order: ${data.shopName}</h1>

        <div class="section">
          <p><span class="label">Customer:</span> ${data.customer.name}</p>
          <p><span class="label">Email:</span> ${data.customer.email}</p>
          <p><span class="label">Order ID:</span> ${data.orderId}</p>
          <p><span class="label">Date:</span> ${data.date}</p>
        </div>

        <div class="section">
          <h2>Products</h2>
          <ul class="products-list">
            ${data.products.map(product => `
              <li>${product.name} (x${product.quantity}) - ${product.price}</li>
            `).join('')}
          </ul>
        </div>

        <div class="order-details">
          <p class="total"><span class="label">Total:</span> ${data.total}</p>
        </div>

        <div class="footer">
          <p>Thanks for using our service!</p>
          <p>If you have questions, contact us at <a href="mailto:supportpdfifyapi@gmail.com">supportpdfifyapi@gmail.com</a>.</p>
          <p>&copy; 2025 🧾PDFify — All rights reserved.</p>
        </div>
      </body>
    </html>
  `;
}

router.post("/generate-shop-order", authenticate, dualAuth, async (req, res) => {
  const { data, isPreview } = req.body;
  if (!data || !data.shopName) {
    return res.status(400).json({ error: "Missing shop order data" });
  }

  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const isBasicUser = !user.isPremium;

    // Initialize usage tracking fields if not present
    user.previewCount = user.previewCount || 0;
    user.lastPreviewReset = user.lastPreviewReset || new Date(0);
    user.usageCount = user.usageCount || 0;
    user.maxUsage = user.maxUsage || 1000; // adjust as needed

    const now = new Date();

    // Reset previewCount monthly if needed
    if (
      now.getUTCFullYear() !== user.lastPreviewReset.getUTCFullYear() ||
      now.getUTCMonth() !== user.lastPreviewReset.getUTCMonth()
    ) {
      user.previewCount = 0;
      user.lastPreviewReset = now;
      await user.save();
    }

    // Decide on watermark based on preview and user type
    let addWatermark = false;

    if (isBasicUser && isPreview) {
      if (user.previewCount < 3) {
        user.previewCount++;
        addWatermark = true;
        await user.save();
      } else {
        addWatermark = false;
      }
    }

    // Set watermark flag on data so generateShopOrderHTML uses it
    data.showWatermark = addWatermark;

    const pdfDir = path.join(__dirname, "../pdfs");
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

    const pdfPath = path.join(pdfDir, `shop_order_${Date.now()}.pdf`);

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();

    const html = generateShopOrderHTML(data, isBasicUser, addWatermark);

    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({ path: pdfPath, format: "A4" });
    await browser.close();

    const pdfBuffer = fs.readFileSync(pdfPath);
    const parsed = await pdfParse(pdfBuffer);
    const pageCount = parsed.numpages;

    if (!isPreview || (isBasicUser && user.previewCount >= 3)) {
      // Check usage limit on full download or previews beyond limit
      if (user.usageCount + pageCount > user.maxUsage) {
        fs.unlinkSync(pdfPath);
        return res.status(403).json({
          error: "Monthly usage limit reached. Upgrade to premium for more pages.",
        });
      }
      user.usageCount += pageCount;
      await user.save();
    }

    res.download(pdfPath, () => fs.unlinkSync(pdfPath));

  } catch (error) {
    console.error("PDF generation error:", error);
    res.status(500).json({ error: "PDF generation failed" });
  }
});

module.exports = router;
