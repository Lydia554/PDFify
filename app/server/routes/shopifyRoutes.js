const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const ShopConfig = require("../models/ShopConfig");
const User = require("../models/User"); 
const authenticate = require("../middleware/authenticate"); 

function generateInvoiceHTML({ shopDomain, invoice }) {
  const {
    shopName = shopDomain || 'Unnamed Shop',
    date = new Date().toISOString().slice(0, 10),
    items = [],
    total = 0,
    customLogoUrl = null,
    showChart = false,
  } = invoice;

  const itemRows = items.length > 0 ? items.map(item => `
    <tr>
      <td>${item.name || 'Item'}</td>
      <td style="text-align:center;">${item.quantity || 1}</td>
      <td style="text-align:right;">€${Number(item.price).toFixed(2)}</td>
    </tr>
  `).join('') : `<tr><td colspan="3" style="text-align:center;">No items</td></tr>`;

  return `
    <html>
      <head>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&display=swap');
          body {
            font-family: 'Montserrat', Arial, sans-serif;
            margin: 40px;
            color: #333;
          }
          header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #4a90e2;
            padding-bottom: 10px;
            margin-bottom: 20px;
          }
          .logo {
            max-height: 60px;
          }
          h1 {
            font-weight: 700;
            color: #4a90e2;
            margin: 0;
          }
          .shop-info {
            font-size: 0.9rem;
            color: #555;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
            box-shadow: 0 0 10px #ddd;
          }
          th, td {
            padding: 12px 15px;
          }
          th {
            background-color: #4a90e2;
            color: white;
            text-align: left;
          }
          tbody tr:nth-child(odd) {
            background-color: #f9f9f9;
          }
          tbody tr:hover {
            background-color: #e6f0fa;
          }
          .total-row td {
            border-top: 2px solid #4a90e2;
            font-weight: 700;
            font-size: 1.1rem;
            text-align: right;
            padding-top: 15px;
          }
          footer {
            margin-top: 40px;
            font-size: 0.8rem;
            color: #777;
            text-align: center;
            border-top: 1px solid #ccc;
            padding-top: 10px;
          }
          /* Premium styling */
          ${showChart ? `
            .premium-badge {
              background-color: #f5a623;
              color: white;
              font-weight: 700;
              padding: 5px 10px;
              border-radius: 5px;
              font-size: 0.85rem;
              position: absolute;
              top: 20px;
              right: 40px;
            }
          ` : ''}
        </style>
      </head>
      <body>
        <header>
          <div>
            <h1>Invoice</h1>
            <p class="shop-info">${shopName}</p>
            <p class="shop-info">Date: ${date}</p>
          </div>
          ${customLogoUrl ? `<img class="logo" src="${customLogoUrl}" alt="Shop Logo" />` : ''}
        </header>

        ${showChart ? `<div class="premium-badge">Premium</div>` : ''}

        <table>
          <thead>
            <tr>
              <th>Item</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
            <tr class="total-row">
              <td colspan="2">Total</td>
              <td>€${Number(total).toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <footer>
          &copy; ${new Date().getFullYear()} ${shopName} • Powered by Your API
        </footer>
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
    const isPremium = user.isPremium && shopConfig?.isPremium;

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

    // Usage and quota check
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
    res.send(pdfBuffer);

    fs.unlinkSync(pdfPath);

  } catch (error) {
    console.error("Shopify invoice generation error:", error);
    res.status(500).json({ error: "PDF generation failed" });
  }
});

module.exports = router;
