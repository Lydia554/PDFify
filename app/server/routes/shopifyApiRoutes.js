const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const pdfParse = require("pdf-parse");
const ShopConfig = require("../models/ShopConfig");
const User = require("../models/User"); 
const authenticate = require("../middleware/authenticate"); 
const router = express.Router();
require('dotenv').config();






function generateInvoiceHTML(invoiceData, isPremium) {
  const { shopName, date, items, total, showChart, customLogoUrl } = invoiceData;

  return `
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>Invoice</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap');
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&display=swap');
          body {
            font-family: 'Open Sans', sans-serif;
            color: #333;
            background: #f4f7fb;
            margin: 0;
            padding: 0;
            min-height: 100vh;
            position: relative;
          }
          .container {
            max-width: 800px;
            margin: 20px auto;
            padding: 30px 40px 160px;
            background: linear-gradient(to bottom right, #ffffff, #f8fbff);
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.08);
            border-radius: 16px;
            border: 1px solid #e0e4ec;
          }
          .logo {
            width: 150px;
            margin-bottom: 20px;
          }
          .logo:empty {
            display: none;
          }
          h1 {
            font-family: 'Playfair Display', serif;
            font-size: 32px;
            color: #2a3d66;
            text-align: center;
            margin: 20px 0;
            letter-spacing: 1px;
          }
          .invoice-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #4a69bd;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          .invoice-header .left,
          .invoice-header .right {
            font-size: 16px;
            line-height: 1.6;
          }
          .invoice-header .right {
            text-align: right;
            color: #777;
          }
          .table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          .table th,
          .table td {
            padding: 14px;
            border: 1px solid #dee2ef;
            text-align: left;
          }
          .table th {
            background-color: #dbe7ff;
            color: #2a3d66;
            font-weight: 600;
          }
          .table td {
            color: #444;
            background-color: #fdfdff;
          }
          .table tr:nth-child(even) td {
            background-color: #f6f9fe;
          }
          .total {
            text-align: right;
            font-size: 20px;
            font-weight: bold;
            color: #2a3d66;
            margin-top: 10px;
          }
          .chart-container {
            text-align: center;
            margin-top: 40px;
            padding: 20px;
            background-color: #fdfdff;
            border: 1px solid #e0e4ec;
            border-radius: 12px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.05);
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .footer {
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
        </style>
      </head>
      <body>
        <div class="container">
          ${customLogoUrl ? `<img src="${customLogoUrl}" class="logo" />` : ""}
          <h1>Invoice</h1>
          <div class="invoice-header">
            <div class="left">
              <strong>From:</strong><br/>
              ${shopName}
            </div>
            <div class="right">
              <strong>Date:</strong><br/>
              ${date}
            </div>
          </div>
          <table class="table">
            <thead>
              <tr>
                <th>Item</th><th>Qty</th><th>Price</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td>${item.name}</td>
                  <td>${item.quantity}</td>
                  <td>$${item.price.toFixed(2)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
          <div class="total">Total: $${total.toFixed(2)}</div>

          ${showChart ? `<div class="chart-container"><h2>Spending Overview</h2><img src="https://via.placeholder.com/400x200?text=Chart" /></div>` : ""}
        </div>
        <div class="footer">
          <p>This invoice was automatically generated by PDFify for Shopify</p>
          <p><a href="https://pdf-api.portfolio.lidija-jokic.com/">Visit our site</a></p>
        </div>
      </body>
    </html>
  `;
}




// Helper function to resolve Shopify token
const resolveShopifyToken = async (req, shopDomain) => {
  let token = req.body.shopifyAccessToken;

  if (!token) {
    token = req.headers["x-shopify-access-token"];
  }

  if (!token && req.user?.userId) {
    const user = await User.findById(req.user.userId);
    if (user?.connectedShopDomain === shopDomain && user.connectedShopToken) {
      token = user.connectedShopToken;
    }
  }

  if (!token) {
    const fallbackUser = await User.findOne({ connectedShopDomain: shopDomain });
    if (fallbackUser?.connectedShopToken) {
      token = fallbackUser.connectedShopToken;
    }
  }

  return token;
};
router.post('/invoice', async (req, res) => {
  try {
    const { order, shopDomain, shopifyAccessToken } = req.body;

    // Safety check
    if (!order?.id) {
      return res.status(400).json({ error: 'Missing orderId' });
    }

    const orderId = order.id.toString();
    const user = await getUserByShopDomain(shopDomain);
    if (!user) return res.status(403).json({ error: 'Shop not authorized' });

    const premium = await isShopPremium(user._id);
    const limitOk = await checkUsageLimit(user._id);
    if (!limitOk && !premium) return res.status(429).json({ error: 'Usage limit exceeded' });

    // Generate the HTML
    const html = await generateInvoiceHTML({
      order,
      shopDomain,
      premium,
    });

    // Launch Puppeteer
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setContent(twemoji.parse(html), { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' },
    });

    await browser.close();

    // Save PDF and return URL
    const filename = `invoice-${orderId}.pdf`;
    const pdfUrl = await uploadToStorageAndGetUrl(pdfBuffer, filename);

    // Optional: Add note to Shopify order (requires write_order access scope)
    if (shopifyAccessToken && shopDomain) {
      try {
        await fetch(`https://${shopDomain}/admin/api/2023-10/orders/${orderId}.json`, {
          method: 'PUT',
          headers: {
            'X-Shopify-Access-Token': shopifyAccessToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            order: {
              id: orderId,
              note: `Invoice PDF: ${pdfUrl}`,
            },
          }),
        });
      } catch (err) {
        console.warn(`Failed to update Shopify order note: ${err.message}`);
      }
    }

    await updateUsage(user._id);
    return res.status(200).json({ pdfUrl });

  } catch (err) {
    console.error('[SHOPIFY INVOICE ERROR]', err);
    return res.status(500).json({ error: 'Failed to generate invoice PDF' });
  }
});






router.get("/connection", authenticate, async (req, res) => {

  try {
    const connectedShopDomain = req.fullUser.connectedShopDomain || null;
    res.json({ connectedShopDomain });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch Shopify connection" });
  }
});


router.post("/connect", authenticate, async (req, res) => {
  try {
    const { shopDomain, accessToken } = req.body;

    if (!shopDomain || !accessToken) {
      return res.status(400).json({ error: "Shop domain and access token required" });
    }

    const normalizedShopDomain = shopDomain.toLowerCase();

    // Use req.fullUser (the Mongoose doc) to update and save
    req.fullUser.connectedShopDomain = normalizedShopDomain;
    req.fullUser.shopifyAccessToken = accessToken;
    await req.fullUser.save();

    res.json({ message: `Shopify store ${normalizedShopDomain} connected successfully.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to connect Shopify store" });
  }
});

router.post("/disconnect", authenticate, async (req, res) => {
  try {
    req.fullUser.connectedShopDomain = null;
    req.fullUser.shopifyAccessToken = null;
    await req.fullUser.save();
    res.json({ message: "Shopify store disconnected successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to disconnect Shopify store" });
  }
});


module.exports = router;