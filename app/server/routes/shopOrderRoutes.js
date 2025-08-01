const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const router = express.Router();
const fs = require("fs");
const authenticate = require("../middleware/authenticate");
const User = require("../models/User");
const dualAuth = require('../middleware/dualAuth');
const { PDFDocument } = require("pdf-lib");
const { incrementUsage } = require("../utils/usageUtils");


if (typeof ReadableStream === "undefined") {
  global.ReadableStream = require("web-streams-polyfill").ReadableStream;
}

function generateShopOrderHTML(data) {
  return `
    <div>
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
    </div>
  `;
}

function wrapHtmlShopOrder(htmlContent, isPremium, addWatermark) {
  const logoUrl = "https://pdfify.pro/images/Logo.png";

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
            min-height: 100vh;
          }
          .logo {
            display: block;
            margin: 0 auto 20px;
            max-width: 120px;
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
        position: static;
        max-width: 800px;
        margin: 40px auto 10px auto;
        padding: 10px 20px;
        background-color: #f0f2f7;
        color: #555;
        border-top: 2px solid #cbd2e1;
        text-align: center;
        line-height: 1.6;
        font-size: 11px;
        border-radius: 0 0 16px 16px;
        box-sizing: border-box;
      }

      .footer p {
        margin: 6px 0;
      }

      .footer a {
        color: #4a69bd;
        text-decoration: none;
        word-break: break-word;
      }

      .footer a:hover {
        text-decoration: underline;
      }
          ${addWatermark ? `
            .watermark {
              position: fixed;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%) rotate(-45deg);
              font-size: 5rem;
              color: rgba(255, 0, 0, 0.1);
              user-select: none;
              pointer-events: none;
              z-index: 9999;
              white-space: nowrap;
              font-weight: bold;
            }
          ` : ''}
        </style>
      </head>
      <body>
        ${isPremium ? '' : `<img src="${logoUrl}" alt="Logo" class="logo" />`}
        ${addWatermark ? `<div class="watermark">FOR PRODUCTION ONLY - NOT AVAILABLE IN BASIC</div>` : ''}
        <div class="content">
          ${htmlContent}
        </div>
      <div class="footer">
      <p>Thanks for using our service!</p>
      <p>If you have questions, contact us at <a href="mailto:pdfifyapi@gmail.com">pdfifyapi@gmail.com</a>.</p>
      <p>&copy; 2025 🧾PDFify — All rights reserved.</p>
      <p>
        Generated using <strong>PDFify</strong>. Visit
        <a href="https://pdfify.pro/" target="_blank">our site</a> for more.
      </p>
    </div>
      </body>
    </html>
  `;
}

router.post("/generate-shop-order", authenticate, dualAuth, async (req, res) => {
  const { data, isPreview = false } = req.body;
  if (!data || !data.shopName) {
    return res.status(400).json({ error: "Missing shop order data" });
  }

  const pdfDir = path.join(__dirname, "../pdfs");
  if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

  const pdfPath = path.join(pdfDir, `shop_order_${Date.now()}.pdf`);

  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const now = new Date();
    if (!user.usageLastReset || now.getMonth() !== new Date(user.usageLastReset).getMonth()) {
      user.usageCount = 0;
      user.previewCount = 0;
      user.usageLastReset = now;
      await user.save();
    }

    const addWatermark = isPreview && !user.isPremium && user.previewCount >= 3;

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    const rawHtml = generateShopOrderHTML(data);
    const wrappedHtml = wrapHtmlShopOrder(rawHtml, user.isPremium, addWatermark);

    await page.setContent(wrappedHtml, { waitUntil: "networkidle0" });
    await page.pdf({ path: pdfPath, format: "A4", printBackground: true });
    await browser.close();

    const pdfBuffer = fs.readFileSync(pdfPath);

 
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pageCount = pdfDoc.getPageCount();


const usageAllowed = await incrementUsage(user, pageCount, isPreview);
if (!usageAllowed) {
  return res.status(403).json({ error: 'Monthly usage limit reached. Upgrade to premium for more pages.' });
}


    res.download(pdfPath, () => fs.unlinkSync(pdfPath));
  } catch (error) {
    console.error("PDF generation error:", error);
    res.status(500).json({ error: "PDF generation failed" });
  }
});


module.exports = router;
