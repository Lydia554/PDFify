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
const crypto = require('crypto');
const bodyParser = require('body-parser');
require('dotenv').config();




function verifyShopifyWebhook(req, res, rawBody) {
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256');

  const secret = process.env.SHOPIFY_WEBHOOK_SECRET; 

  const hash = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');

  if (hash !== hmacHeader) {
    throw new Error('Webhook HMAC validation failed');
  }
}


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

 //const isPremium = user.isPremium && shopConfig?.isPremium;

 router.post("/shopify/invoice", authenticate, async (req, res) => {
  try {
    // Read shop domain and token from headers (not from body)
    const shopDomain = req.headers["x-shopify-shop-domain"];
    const token = req.headers["x-shopify-access-token"];
    console.log("Received shop domain:", shopDomain);
    console.log("Received Shopify access token:", token ? '***' : 'missing');

    if (!shopDomain) {
      console.log("Error: Missing shop domain header");
      return res.status(400).json({ error: "Missing shop domain" });
    }
    if (!token) {
      console.log("Error: Missing Shopify access token header");
      return res.status(400).json({ error: "Missing Shopify access token" });
    }

    // Read orderId only from body
    const { orderId } = req.body;
    if (!orderId) {
      console.log("Error: Missing orderId in request body");
      return res.status(400).json({ error: "Missing orderId" });
    }

    // No more shop or token in body, so skip that validation here

    // Fetch order data from Shopify API using headers for auth
    const shopifyOrderUrl = `https://${shopDomain}/admin/api/2023-10/orders/${orderId}.json`;
    console.log("Fetching order from Shopify:", shopifyOrderUrl);

    let orderResponse;
    try {
      orderResponse = await axios.get(shopifyOrderUrl, {
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
          // No Authorization Bearer needed here
        },
      });
      console.log("Shopify order response status:", orderResponse.status);
    } catch (err) {
      console.error("Error fetching order from Shopify:", err.response?.data || err.message);
      return res.status(500).json({ error: "Failed to fetch order from Shopify" });
    }

    const order = orderResponse.data.order;
    if (!order || !order.line_items) {
      console.log("Error: Invalid order data received from Shopify");
      return res.status(400).json({ error: "Invalid order data from Shopify" });
    }

    // Find user from auth middleware
    const user = await User.findById(req.user.userId);
    if (!user) {
      console.log("User not found with ID:", req.user.userId);
      return res.status(404).json({ error: "User not found" });
    }
    console.log("Authenticated user:", user.email);

    // Find shop config for this shop
    const shopConfig = await ShopConfig.findOne({ shopDomain });
    console.log("Shop config found:", !!shopConfig);

    // Premium check
    const FORCE_PREMIUM = true;
    const isPreview = req.query.preview === 'true';
    const isPremium = FORCE_PREMIUM || (user.isPremium && shopConfig?.isPremium);
    console.log("isPremium:", isPremium, "isPreview:", isPreview);

    // Prepare invoice data
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
    console.log("Invoice data prepared:", invoiceData);

    // PDF paths & filenames
    const safeOrderId = `shopify-${order.id}`;
    const pdfDir = path.join(__dirname, "../pdfs");
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir);
      console.log("Created PDF directory:", pdfDir);
    }

    const pdfPath = path.join(pdfDir, `Invoice_${safeOrderId}.pdf`);
    console.log("PDF will be saved to:", pdfPath);

    // Launch puppeteer and generate PDF
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();

    const html = generateInvoiceHTML(invoiceData, isPremium);
    console.log("Generated invoice HTML");

    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({ path: pdfPath, format: "A4" });
    console.log("PDF generated");

    await browser.close();

    // Read PDF file buffer
    const pdfBuffer = fs.readFileSync(pdfPath);
    const parsed = await pdfParse(pdfBuffer);
    const pageCount = parsed.numpages;
    console.log("PDF page count:", pageCount);

    if (!isPreview) {
      if (user.usageCount + pageCount > user.maxUsage) {
        fs.unlinkSync(pdfPath);
        console.log("Usage limit reached. PDF deleted.");
        return res.status(403).json({
          error: "Monthly usage limit reached. Upgrade to premium for more pages.",
        });
      }

      user.usageCount += pageCount;
      await user.save();
      console.log("User usage count updated:", user.usageCount);

      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=Invoice_${safeOrderId}.pdf`,
      });
    } else {
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
      });
      console.log("Sending PDF inline preview");
    }

    res.send(pdfBuffer);

    // Clean up - delete PDF file
    fs.unlinkSync(pdfPath);
    console.log("Temporary PDF file deleted");

  } catch (error) {
    console.error("Shopify invoice generation error:", error);
    res.status(500).json({ error: "PDF generation failed" });
  }
});



router.post('/order-created', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
  try {
    console.log('Webhook received');

    const rawBody = req.body;
    console.log('Raw body length:', rawBody.length);
    console.log('Raw body (utf8):', rawBody.toString('utf8'));
    console.log('Raw body (hex):', rawBody.toString('hex'));

    console.log('Headers:', req.headers);
    console.log('X-Shopify-Hmac-Sha256 header:', req.get('X-Shopify-Hmac-Sha256'));

    verifyShopifyWebhook(req, res, rawBody);
    console.log('Shopify webhook verified successfully');

    const order = JSON.parse(rawBody.toString());
    console.log('Parsed order:', { id: order.id, email: order.email || 'N/A' });

    const shopDomain = req.headers['x-shopify-shop-domain'];
    console.log('Shop domain from headers:', shopDomain);

    if (!shopDomain) {
      console.error('Missing X-Shopify-Shop-Domain header');
      return res.status(400).send('Missing shop domain header');
    }

    // Optional: Get store token from DB (if you store tokens per shop)
    const token = await getTokenForShop(shopDomain);
    console.log('Retrieved token for shop:', token ? '***' : 'No token found');

    if (!token) {
      console.error('No token found for shop:', shopDomain);
      return res.status(401).send('Unauthorized: missing token');
    }

    // Call your existing invoice generator (same as `/shopify/invoice`)
    const invoiceRes = await axios.post(
      'https://pdf-api.portfolio.lidija-jokic.com/shopify/invoice',
      { orderId: order.id }, // only orderId in body
      {
        headers: {
          "x-shopify-shop-domain": shopDomain,
          "x-shopify-access-token": token,
        }
      }
    );

    console.log('Invoice generator response status:', invoiceRes.status);
    console.log('Invoice generator response data:', invoiceRes.data);
    const pdfUrl = invoiceRes.data?.pdfUrl;
    console.log('PDF Generated at:', pdfUrl);

    res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook failed:', err.message);
    if (err.response) {
      console.error('Error response data:', err.response.data);
      console.error('Error response status:', err.response.status);
      console.error('Error response headers:', err.response.headers);
    }
    res.status(401).send('Unauthorized or Error');
  }
});


module.exports = router;
