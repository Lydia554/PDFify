const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const router = express.Router();
const fs = require("fs");
const authenticate = require("../middleware/authenticate");
const User = require("../models/User"); 
const pdfParse = require("pdf-parse");

if (typeof ReadableStream === "undefined") {
  global.ReadableStream = require("web-streams-polyfill").ReadableStream;
}

const log = (message, data = null) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(message, data);
  }
};

function generateShopOrderHTML(data) {
  const logoUrl = "https://pdf-api.portfolio.lidija-jokic.com/images/Logo.png";

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
          }
          img.logo {
            width: 150px;
            margin-bottom: 20px;
            display: block;
            margin-left: auto;
            margin-right: auto;
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
            text-align: center;
            margin-top: 40px;
            font-size: 14px;
            color: #777;
            border-top: 1px dashed #ccc;
            padding-top: 20px;
          }
          .footer a {
            color: #5e60ce;
            text-decoration: none;
          }
          .footer a:hover {
            text-decoration: underline;
          }

/* MOBILE STYLES */
  @media (max-width: 600px) {
    body {
      padding: 20px;
    }

    h1 {
      font-size: 1.5em;
    }

    h2 {
      font-size: 1.2em;
    }

    .section {
      padding: 15px;
    }

    .products-list {
      padding: 8px;
    }

    .total {
      font-size: 1em;
    }

    img.logo {
      width: 100px;
    }

    .footer {
      font-size: 12px;
    }
  }



        </style>
      </head>
      <body>
        <img src="${logoUrl}" alt="Company Logo" class="logo" />
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
          <p>Thank you for your order! We hope to serve you again soon.</p>
          <p>If you have questions, contact us at <a href="mailto:supportpdfifyapi@gmail.com">supportpdfifyapi@gmail.com</a>.</p>
          <p>&copy; 2025 TetaFit Store — All rights reserved.</p>
        </div>
      </body>
    </html>
  `;
}


router.post("/generate-shop-order", authenticate, async (req, res) => {
  const { data } = req.body;
  log("Received data for shop order generation:", data);

  if (!data || !data.shopName) {
    log("Invalid shop order data:", data);
    return res.status(400).json({ error: "Missing shop order data" });
  }

  const pdfDir = path.join(__dirname, "../pdfs");
  if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir, { recursive: true });
  }

  const pdfPath = path.join(pdfDir, `shop_order_${Date.now()}.pdf`);

  try {
    log("Launching Puppeteer...");
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    log("Puppeteer launched successfully.");

    const page = await browser.newPage();
    log("New page created.");

    const html = generateShopOrderHTML(data);
    log("Generated HTML for shop order:", html);

    await page.setContent(html, { waitUntil: "networkidle0" });
    log("HTML content set on the page.");

    await page.pdf({ path: pdfPath, format: "A4" });
    log("PDF generated successfully at:", pdfPath);

    await browser.close();
    log("Browser closed.");

   
    const pdfBuffer = fs.readFileSync(pdfPath);
    const parsed = await pdfParse(pdfBuffer);
    const pageCount = parsed.numpages;
    log(`Generated PDF has ${pageCount} pages.`);

    const user = await User.findById(req.user.userId);
    if (!user) {
      fs.unlinkSync(pdfPath);
      return res.status(404).json({ error: "User not found" });
    }

    if (user.usageCount + pageCount > user.maxUsage) {
      fs.unlinkSync(pdfPath);
      return res.status(403).json({ error: "Monthly usage limit reached. Upgrade to premium for more pages." });
    }

    user.usageCount += pageCount;
    await user.save();
    log("User usage count updated:", user.usageCount);

    res.download(pdfPath, (err) => {
      if (err) {
        console.error("Error sending file:", err);
      }
      fs.unlinkSync(pdfPath);
    });
  } catch (error) {
    console.error("Shop order PDF generation failed:", error);
    res.status(500).json({ error: "PDF generation failed" });
  }
});

module.exports = router;
