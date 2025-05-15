const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const router = express.Router();
const fs = require("fs");
const authenticate = require("../middleware/authenticate");
const User = require("../models/User");
const pdfParse = require("pdf-parse");

const log = (message, data = null) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(message, data);
  }
};

function generatePackingSlipHTML(data) {
  const logoUrl = "https://pdf-api.portfolio.lidija-jokic.com/images/Logo.png";

  return `
    <html>
      <head>
        <style>
          body {
            font-family: 'Open Sans', sans-serif;
            padding: 40px;
            background-color: #f7f9fc;
            color: #333;
          }

          .container {
            max-width: 800px;
            margin: auto;
            background: #fff;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.1);
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
            margin-top: 30px;
            font-size: 14px;
            text-align: center;
            color: #777;
          }
        </style>
      </head>
      <body>
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
            <p>Thank you for your order!</p>
            <p>If you have any questions, contact us at <a href="mailto:support@pdfifyapi.gmail.com">support@pdfifyapi.gmail.com</a></p>
          </div>
        </div>
      </body>
    </html>
  `;
}

router.post("/generate-packing-slip", authenticate, async (req, res) => {
  const { data } = req.body;

  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const pdfDir = path.join(__dirname, "../pdfs");
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const pdfPath = path.join(pdfDir, `PackingSlip_${data.orderId}.pdf`);

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    const html = generatePackingSlipHTML(data);

    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({ path: pdfPath, format: "A4" });
    await browser.close();

    
    const pdfBuffer = fs.readFileSync(pdfPath);
    const parsed = await pdfParse(pdfBuffer);
    const pageCount = parsed.numpages;

    if (user.usageCount + pageCount > user.maxUsage) {
      fs.unlinkSync(pdfPath);
      return res.status(403).json({
        error: "Monthly usage limit reached. Upgrade to premium for more pages.",
      });
    }

    user.usageCount += pageCount;
    await user.save();

    res.download(pdfPath, (err) => {
      if (err) {
        console.error("Error sending file:", err);
      }
      fs.unlinkSync(pdfPath);
    });
  } catch (error) {
    console.error("Packing Slip PDF generation error:", error);
    res.status(500).json({ error: "PDF generation failed" });
  }
});

module.exports = router;
