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




router.post("/api/shopify/invoice", authenticate, async (req, res) => {
  try {
    const shopDomain = req.headers["x-shopify-shop-domain"];
    const token = req.headers["x-shopify-access-token"];

    if (!shopDomain) {
      return res.status(400).json({ error: "Missing shop domain" });
    }
    if (!token) {
      return res.status(400).json({ error: "Missing Shopify access token" });
    }

    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: "Missing orderId" });
    }

    const shopifyOrderUrl = `https://${shopDomain}/admin/api/2023-10/orders/${orderId}.json`;
    let orderResponse;
    try {
      orderResponse = await axios.get(shopifyOrderUrl, {
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
        },
      });
    } catch (err) {
      return res.status(500).json({ error: "Failed to fetch order from Shopify" });
    }

    const order = orderResponse.data.order;
    if (!order || !order.line_items) {
      return res.status(400).json({ error: "Invalid order data from Shopify" });
    }

    let user = null;
    if (req.user?.userId) {
      user = await User.findById(req.user.userId);
    }
    if (!user) {
      user = await User.findOne({ connectedShopDomain: shopDomain });
    }
    if (!user) {
      return res.status(404).json({ error: "User not found for this shop" });
    }

    const shopConfig = await ShopConfig.findOne({ shopDomain });

    const FORCE_PREMIUM = true;
    const isPreview = req.query.preview === "true";
    const isPremium = FORCE_PREMIUM || (user.isPremium && shopConfig?.isPremium);

    const invoiceData = {
      shopName: shopConfig?.shopName || shopDomain || "Unnamed Shop",
      date: new Date(order.created_at).toISOString().slice(0, 10),
      items: order.line_items.map((item) => ({
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
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir);
    }

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

    if (!isPreview) {
      if (user.usageCount + pageCount > user.maxUsage) {
        fs.unlinkSync(pdfPath);
        return res.status(403).json({
          error: "Monthly usage limit reached. Upgrade to premium for more pages.",
        });
      }

      user.usageCount += pageCount;
      await user.save();
    }

    try {
      if (order.email) {
        await sendEmailWithAttachment({
          to: order.email,
          subject: `Your Invoice from ${invoiceData.shopName}`,
          text: "Please find your invoice attached.",
          attachments: [
            {
              filename: `Invoice_${safeOrderId}.pdf`,
              content: pdfBuffer,
            },
          ],
        });
        console.log("Invoice emailed to:", order.email);
      } else {
        console.warn("No email found on order, skipping email");
      }
    } catch (emailErr) {
      console.error("Failed to send invoice email:", emailErr);
    }

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": isPreview
        ? "inline"
        : `attachment; filename=Invoice_${safeOrderId}.pdf`,
    });
    res.send(pdfBuffer);

    fs.unlinkSync(pdfPath);
  } catch (error) {
    console.error("Shopify invoice generation error:", error);
    res.status(500).json({ error: "PDF generation failed" });
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