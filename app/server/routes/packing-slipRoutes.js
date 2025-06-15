const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const router = express.Router();
const fs = require("fs");
const authenticate = require("../middleware/authenticate");
const User = require("../models/User");

if (typeof ReadableStream === "undefined") {
  global.ReadableStream = require("web-streams-polyfill").ReadableStream;
}

function generatePackingSlipHTML(data, addWatermark = false, isBasic = true) {
  const logoHtml = isBasic
    ? `<img src="https://pdf-api.portfolio.lidija-jokic.com/images/Logo.png" alt="Company Logo" class="logo" />`
    : "";

  const watermark = addWatermark
    ? `<div style="
        position: fixed;
        top: 40%;
        left: 20%;
        transform: rotate(-30deg);
        font-size: 70px;
        color: rgba(200, 200, 200, 0.3);
        z-index: 9999;
        pointer-events: none;
      ">PDFIFY BASIC</div>`
    : "";

  return `
    <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 0; padding: 0;
            background: #fff;
            color: #333;
          }
          .container {
            max-width: 800px;
            margin: 30px auto;
            padding: 20px;
            border: 1px solid #ddd;
            border-radius: 8px;
            position: relative;
            z-index: 10;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .logo {
            max-width: 150px;
            margin-bottom: 10px;
          }
          h1 {
            font-weight: bold;
            color: #5e60ce;
            font-size: 2.5rem;
            margin: 0;
          }
          .section {
            margin-bottom: 25px;
          }
          .section h2 {
            border-bottom: 2px solid #ddd;
            padding-bottom: 5px;
            color: #2a3d66;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            border: 1px solid #ccc;
            padding: 8px;
            text-align: left;
          }
          th {
            background: #f4f7fb;
          }
        </style>
      </head>
      <body>
        ${watermark}
        <div class="container">
          <div class="header">
            ${logoHtml}
            <h1>Packing Slip</h1>
          </div>
          <div class="section">
            <strong>Order Number:</strong> ${data.orderNumber || "N/A"}<br/>
            <strong>Customer Name:</strong> ${data.customerName || "N/A"}<br/>
            <strong>Date:</strong> ${data.date || new Date().toLocaleDateString()}<br/>
          </div>
          <div class="section">
            <h2>Items</h2>
            <table>
              <thead>
                <tr><th>Product</th><th>Quantity</th><th>SKU</th></tr>
              </thead>
              <tbody>
                ${data.items && data.items.length
                  ? data.items.map(item => `
                    <tr>
                      <td>${item.name || ""}</td>
                      <td>${item.quantity || 0}</td>
                      <td>${item.sku || ""}</td>
                    </tr>
                  `).join("")
                  : "<tr><td colspan='3'>No items found</td></tr>"
                }
              </tbody>
            </table>
          </div>
        </div>
      </body>
    </html>
  `;
}

router.post("/generate-packing-slip", authenticate, async (req, res) => {
  try {
    const { data } = req.body;

    if (!data) {
      return res.status(400).json({ error: "Missing data" });
    }

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const isPremium = user.isPremium;
    const isBasic = !isPremium;
    const isProd = process.env.NODE_ENV === "production";

  
    const addWatermark = isBasic && isProd;

    const html = generatePackingSlipHTML(data, addWatermark, isBasic);

    const pdfDir = path.join(__dirname, "../pdfs");
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const pdfPath = path.join(pdfDir, `packing-slip_${Date.now()}.pdf`);

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({ path: pdfPath, format: "A4" });
    await browser.close();

    res.download(pdfPath, (err) => {
      if (err) console.error("Error sending file:", err);
      fs.unlinkSync(pdfPath);
    });
  } catch (error) {
    console.error("Packing slip generation failed:", error);
    res.status(500).json({ error: "PDF generation failed" });
  }
});

module.exports = router;
