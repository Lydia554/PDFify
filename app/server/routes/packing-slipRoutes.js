const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const router = express.Router();
const fs = require("fs");
const authenticate = require("../middleware/authenticate");
const dualAuth = require("../middleware/dualAuth");
const User = require("../models/User");
const pdfParse = require("pdf-parse");

const log = (message, data = null) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(message, data);
  }
};

function generatePackingSlipHTML(data, addWatermark = false) {
  const logoUrl = "https://pdf-api.portfolio.lidija-jokic.com/images/Logo.png";

  const watermark = addWatermark
    ? `<div style="position: fixed; top: 40%; left: 20%; transform: rotate(-30deg); font-size: 70px; color: rgba(200, 200, 200, 0.3); z-index: 9999; pointer-events: none;">PDFIFY BASIC</div>`
    : "";

  return `
    <html>
      <head>
        <style>
          body {
            font-family: 'Open Sans', sans-serif;
            padding: 40px;
            background-color: #f7f9fc;
            color: #333;
            position: relative;
          }

          .container {
            max-width: 800px;
            margin: auto;
            background: #fff;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.1);
            position: relative;
            z-index: 1;
          }

          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #ccc;
            padding-bottom: 15px;
            margin-bottom: 25px;
          }

          .logo {
            height: 60px;
          }

          h1 {
            font-size: 24px;
            margin: 0;
            color: #2a3d66;
          }

          .info {
            margin-bottom: 20px;
          }

          .info p {
            margin: 5px 0;
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          table th, table td {
            border: 1px solid #ddd;
            padding: 12px;
            text-align: left;
          }

          table th {
            background-color: #f0f4fa;
            font-weight: 600;
          }

          table tr:nth-child(even) td {
            background-color: #f9f9f9;
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
            body {
              padding: 20px;
            }

            .container {
              padding: 20px;
            }

            .header {
              flex-direction: column;
              align-items: flex-start;
            }

            h1 {
              font-size: 20px;
              text-align: left;
            }

            .info p {
              font-size: 15px;
            }

            table th,
            table td {
              font-size: 14px;
              padding: 10px;
            }

            .footer {
              font-size: 11px;
              padding: 15px 10px;
              line-height: 1.4;
            }

            .footer p {
              margin: 6px 0;
            }

            .footer a {
              word-break: break-word;
            }
          }
        </style>
      </head>
      <body>
        ${watermark}
        <div class="container">
          <div class="header">
            <img src="${logoUrl}" alt="Company Logo" class="logo" />
            <h1>Packing Slip</h1>
          </div>

          <div class="info">
            <p><strong>Order ID:</strong> ${data.orderId}</p>
            <p><strong>Customer:</strong> ${data.customerName}</p>
            <p><strong>Address:</strong> ${data.shippingAddress}</p>
            <p><strong>Date:</strong> ${data.date}</p>
          </div>

          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>SKU</th>
                <th>Quantity</th>
              </tr>
            </thead>
            <tbody>
              ${data.items.map(item => `
                <tr>
                  <td>${item.name}</td>
                  <td>${item.sku || '-'}</td>
                  <td>${item.quantity}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="footer">
            <p>Thanks for using our service!</p>
            <p>If you have questions, contact us at <a href="mailto:supportpdfifyapi@gmail.com">supportpdfifyapi@gmail.com</a>.</p>
            <p>&copy; 2025 🧾PDFify — All rights reserved.</p>
            <p>
              Generated using <strong>PDFify</strong>. Visit 
              <a href="https://pdf-api.portfolio.lidija-jokic.com/" target="_blank">our site</a> for more.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
}

router.post("/generate-packing-slip", authenticate, dualAuth, async (req, res) => {
  const { data, isPreview } = req.body;

  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const isProd = process.env.NODE_ENV === "production";
    const isBasic = !user.isPremium;

    if (isPreview) {
      if (isBasic && user.previewCount >= 3) {
        return res.status(403).json({ error: "Preview limit reached. Upgrade for more." });
      }

      user.previewCount = (user.previewCount || 0) + 1;
      await user.save();
    } else {
      if (isBasic && user.usageCount + 1 > user.maxUsage) {
        return res.status(403).json({
          error: "Monthly usage limit reached. Upgrade to premium for more pages.",
        });
      }
    }

    const safeOrderId = data.orderId || `preview-${Date.now()}`;
    const pdfDir = path.join(__dirname, "../pdfs");

    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

    const pdfPath = path.join(pdfDir, `PackingSlip_${safeOrderId}.pdf`);

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    const html = generatePackingSlipHTML(data, isProd && isBasic);
    await page.setContent(html, { waitUntil: "networkidle0" });

    await page.pdf({ path: pdfPath, format: "A4", printBackground: true });
    await browser.close();

    if (!isPreview && isBasic) {
      const parsed = await pdfParse(fs.readFileSync(pdfPath));
      user.usageCount += parsed.numpages;
      await user.save();
    }

    res.download(pdfPath, (err) => {
      if (err) console.error("Error sending file:", err);
      fs.unlinkSync(pdfPath);
    });
  } catch (error) {
    console.error("Packing Slip PDF generation error:", error);
    res.status(500).json({ error: "PDF generation failed" });
  }
});

module.exports = router;
