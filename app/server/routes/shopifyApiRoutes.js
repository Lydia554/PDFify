const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const ShopConfig = require("../models/ShopConfig");
const User = require("../models/User"); 

const authenticate = require("../middleware/authenticate"); 
const dualAuth = require("../middleware/dualAuth");
const {resolveShopifyToken} = require("../utils/shopifyHelpers");
const { resolveLanguage } = require("../utils/resolveLanguage");
require('dotenv').config();
const { incrementUsage } = require("../utils/usageUtils");
const { createShopifyInvoicePdf } = require("../../templates/shopifyMerchantTemplate");
const { generateZugferdXML } = require("../utils/zugferdHelper");






function formatPrice(amount, currency = "EUR", locale = "de-DE") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
}





const router = express.Router();
require('dotenv').config();

function generateInvoiceHTML(invoiceData, isPremium, lang, t) {
const {
  shopName,
  date,
  items,
  formattedSubtotal,
  formattedTaxTotal,
  formattedTotal,
  showChart,
  customLogoUrl,
  fallbackLogoUrl,
  customerName,
  shippingAddress,
  billingAddress,
} = invoiceData;

  const basicTemplate = `
    <html>
      <head><meta charset="UTF-8" /><title>Invoice</title></head>
      <body style="font-family: sans-serif;">
        <h1>Invoice</h1>
        <p><strong>From:</strong> ${shopName}</p>
        <p><strong>Date:</strong> ${date}</p>
        <table border="1" cellpadding="10" cellspacing="0" width="100%">
          <thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead>
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
        <h3>Total: ${formattedTotal}
</h3>
      </body>
    </html>
  `;

const premiumTemplate = `
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
        }

        .container {
          max-width: 800px;
          margin: 20px auto;
          padding: 30px 40px 160px;
          background: linear-gradient(to bottom right, #ffffff, #f8fbff);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.08);
          border-radius: 16px;
        }

        .logo {
          width: 150px;
          margin-bottom: 20px;
        }

        h1 {
          font-family: 'Playfair Display', serif;
          font-size: 32px;
          color: #04754aff;;
          text-align: center;
        }

        .invoice-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 2px solid #04754aff;
        }


   
.summary {
  margin-top: 30px;
  border-top: 2px solid #cbd2e1;
  padding-top: 15px;
  max-width: 400px;
  margin-left: auto;
  font-size: 1em;
  font-family: 'Open Sans', sans-serif;
  color: #95BF47;
}

.summary-line {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  font-weight: 600;
  color: ##95BF47;;
  letter-spacing: 0.02em;
}

.summary-line.total {
  font-size: 1.25em;
  border-top: 1px solid #a3aed8;
  padding-top: 12px;
  margin-top: 14px;
  font-weight: 700;
  color: #04754aff;;
}


.summary-line.total {
  background: #e9f0ff;
  border-radius: 4px;
  padding-left: 10px;
  padding-right: 10px;
}


.customer-info {
  margin: 30px 0;
  padding: 20px 25px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(23, 177, 118, 0.15);
  font-family: 'Open Sans', sans-serif;
  color: #010201ff;
  font-size: 1em;
  line-height: 1.5;
  font-weight: 600;
  letter-spacing: 0.02em;
  transition: box-shadow 0.3s ease;
}

.customer-info:hover {
  box-shadow: 0 8px 24px rgba(4, 87, 18, 0.3);
}

.customer-info p {
  margin: 6px 0;
}


.shipping-info {
  background: linear-gradient(135deg, #e0ffe8 0%, #c8f7df 100%);
  border-left: 6px solid #04754aff; 
}


.billing-info {
  background: linear-gradient(135deg, #fffbe6 0%, #fff4c2 100%);
  border-left: 6px solid #95BF47;
}



.table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0 8px; /* vertical spacing between rows */
  font-family: 'Open Sans', sans-serif;
}

.table th,
.table td {
  padding: 14px 18px;
  border: none;
  background-color: #f7faff;
  vertical-align: middle;
  color: #036b32ff;
  box-shadow: inset 0 -1px 0 #95BF47;
  border-radius: 8px;
}

.table th {
  background-color: #dbe7ff;
  font-weight: 700;
  color: #04754aff;
  text-align: left;
}

.table tbody tr:hover td {
  background-color: #e6f0ff;
  cursor: default;
}


       

        .product-image {
          width: 60px;
          height: 60px;
          object-fit: contain;
          border-radius: 8px;
          border: 1px solid #ccc;
          background: white;
        }

    

        .chart-container {
          margin-top: 30px;
          text-align: center;
        }

        .footer {
          max-width: 800px;
          margin: 40px auto 10px auto;
          padding: 10px 20px;
          background-color: #f0f2f7;
          color: #555;
          text-align: center;
          font-size: 11px;
          border-top: 2px solid #cbd2e1;
          border-radius: 0 0 16px 16px;
          position: static;
        }
      </style>

      </head>
<body>
  <div class="container">
    <img src="${customLogoUrl || fallbackLogoUrl}" class="logo" />

    <h1>${t.invoiceTitle}</h1>

    <div class="invoice-header">
      <div><strong>${t.from}</strong><br>${shopName}</div>
      <div><strong>${t.date}</strong><br>${date}</div>
    </div>

 <!-- 👤 Customer Info -->
<div class="customer-info shipping-info">
  <p><strong>${t.customerName}:</strong> ${customerName}</p>
  <p><strong>${t.shippingAddress}:</strong> ${shippingAddress}</p>
</div>

<div class="customer-info billing-info">
  <p><strong>${t.billingAddress}:</strong> ${billingAddress}</p>
</div>


    <!-- 🛒 Item Table -->
    <table class="table">
      <thead>
        <tr>
          <th>${t.image}</th>
          <th>${t.item}</th>
          <th>${t.quantity}</th>
          <th>${t.price}</th>
          <th>${t.taxIncluded}</th>
        </tr>
      </thead>


      <tbody>
        ${items
          .map(
            (item) => `
            <tr>
              <td>${
                item.imageUrl
                  ? `<img src="${item.imageUrl}" class="product-image" />`
                  : ""
              }</td>
              <td>${item.name}</td>
              <td>${item.quantity}</td>
              <td>${item.formattedPrice}</td>
              <td>${t.taxIncluded}</td>
            </tr>
          `
          )
          .join("")}
      </tbody>
    </table>

    <!-- 💰 Summary Section -->
    <div class="summary">
      <div class="summary-line"><span>${t.subtotal}:</span><span>${formattedSubtotal}</span></div>
      <div class="summary-line"><span>${t.taxTotal}:</span><span>${formattedTaxTotal}</span></div>
      <div class="summary-line total"><strong>${t.totalGross}:</strong><strong>${formattedTotal}</strong></div>
    </div>



    ${
      showChart
        ? `<div class="chart-container"><h2>${t.spendingOverview}</h2><img src="https://via.placeholder.com/400x200?text=Chart" /></div>`
        : ""
    }
  </div>

  <div class="footer">
    <p>${t.footerNote}</p>
    <p><a href="https://pdfify.pro/">${t.visitSite}</a></p>
  </div>
</body>

    </html>
  `;

  return isPremium ? premiumTemplate : basicTemplate;

}

// ----------------------------
// /invoice POST route
// ----------------------------
router.post("/invoice", authenticate, dualAuth, async (req, res) => {
  try {
    const shopDomain = req.body.shopDomain || req.headers["x-shopify-shop-domain"];
    if (!shopDomain) return res.status(400).json({ error: "Missing shop domain" });

    let orderId = req.body.orderId;
    let order = req.body.order || null;

    // Fetch Shopify order if not provided
    if (!order && orderId) {
      const token = await resolveShopifyToken(req, shopDomain);
      if (!token) return res.status(400).json({ error: "Missing Shopify access token" });

      if (typeof orderId === "string" && orderId.startsWith("gid://")) {
        orderId = orderId.split("/").pop();
      }

      try {
        const resp = await axios.get(`https://${shopDomain}/admin/api/2023-10/orders/${orderId}.json`, {
          headers: { "X-Shopify-Access-Token": token },
        });
        order = resp.data.order;
      } catch (err) {
        console.error("❌ Failed to fetch order:", err.response?.data || err.message);
        return res.status(500).json({ error: "Failed to fetch order from Shopify" });
      }
    }

    if (!order || !order.line_items) return res.status(400).json({ error: "Invalid or missing order data" });

    const shopConfig = (await ShopConfig.findOne({ shopDomain })) || {};
    const { lang, t } = await resolveLanguage({ req, order, shopDomain, shopConfig });

    let user = req.user?.userId
      ? await User.findById(req.user.userId)
      : await User.findOne({ connectedShopDomain: shopDomain });
    if (!user) return res.status(404).json({ error: "User not found" });

    const isPreview = req.query.preview === "true";
    const isMerchant = req.query.merchant === "true";

    let pdfBuffer;

    // ----------------------------
    // Merchant PDF (always compliant)
    // ----------------------------
    if (isMerchant) {
      try {
        console.log("🔹 Generating merchant PDF for user:", user.email);

        // Generate ZUGFeRD XML for compliance
        const zugferdXml = generateZugferdXML(order);

        // Generate merchant PDF (no images/logos)
        pdfBuffer = await createShopifyInvoicePdf(order, { merchant: true }, zugferdXml);

        // Increment usage (1 page by default)
        await incrementUsage(user, 1, isPreview);

        res.set({
          "Content-Type": "application/pdf",
          "Content-Disposition": isPreview
            ? "inline"
            : `attachment; filename=${order.name || order.id}.pdf`,
        });
        return res.send(pdfBuffer);
      } catch (err) {
        console.error("❌ Merchant PDF generation failed:", err);
        return res.status(500).json({ error: "Failed to generate merchant PDF" });
      }
    }

    // ----------------------------
    // Customer PDF (depends on shop config)
    // ----------------------------
    if (!shopConfig.allowCustomerPDF) {
      return res.status(403).json({ error: "Customer PDFs are not allowed by this merchant" });
    }

    const pdfDir = path.join(__dirname, "../pdfs");
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir);

    const currency = order.currency || "EUR";
    const localeMap = { de: "de-DE", en: "en-US", sl: "sl-SI" };
    const locale = localeMap[lang] || "en-US";

    let subtotal = 0;
    let taxTotal = 0;
    if (Array.isArray(order.tax_lines)) {
      taxTotal = order.tax_lines.reduce((sum, line) => sum + parseFloat(line.price || 0), 0);
    }

    const enrichedItems = order.line_items.map(item => {
      const price = parseFloat(item.price) || 0;
      const quantity = parseFloat(item.quantity) || 0;
      const total = price * quantity;
      subtotal += total;
      return {
        ...item,
        price,
        quantity,
        formattedPrice: formatPrice(price, currency, locale),
        formattedTotal: formatPrice(total, currency, locale),
      };
    });

    const rawTotal = subtotal + taxTotal;
    const invoiceData = {
      shopName: shopConfig.shopName || shopDomain,
      date: new Date(order.created_at).toISOString().slice(0, 10),
      items: enrichedItems,
      subtotal,
      taxTotal,
      total: rawTotal,
      formattedSubtotal: formatPrice(subtotal, currency, locale),
      formattedTaxTotal: formatPrice(taxTotal, currency, locale),
      formattedTotal: formatPrice(rawTotal, currency, locale),
      customerName: `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim(),
      shippingAddress: order.shipping_address
        ? `${order.shipping_address.address1 || ""}, ${order.shipping_address.city || ""}`
        : "N/A",
      billingAddress: order.billing_address
        ? `${order.billing_address.address1 || ""}, ${order.billing_address.city || ""}`
        : "N/A",
      showChart: shopConfig?.showChart,
      customLogoUrl: shopConfig?.customLogoUrl,
      fallbackLogoUrl: "/assets/default-logo.png",
      currency,
      locale,
    };

    const pdfPath = path.join(pdfDir, `Invoice_shopify-${order.id}.pdf`);
    const browser = await require("puppeteer").launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    const html = generateInvoiceHTML(invoiceData, user.isPremium, lang, t);
    console.log("🔹 Customer PDF HTML length:", html.length);

    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      margin: { top: "40px", bottom: "40px", left: "40px", right: "40px" },
    });
    await browser.close();

    pdfBuffer = fs.readFileSync(pdfPath);
    await incrementUsage(user, 1, isPreview);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": isPreview ? "inline" : `attachment; filename=${order.name || order.id}.pdf`,
    });
    res.send(pdfBuffer);
    fs.unlinkSync(pdfPath);

  } catch (err) {
    console.error("❌ Invoice route error:", err);
    res.status(500).json({ error: "PDF generation failed" });
  }
});


router.get("/connection", authenticate, dualAuth, async (req, res) => {

  try {
    const connectedShopDomain = req.fullUser.connectedShopDomain || null;
    res.json({ connectedShopDomain });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch Shopify connection" });
  }
});


router.post("/connect", authenticate, dualAuth, async (req, res) => {
  try {
    const { shopDomain, accessToken } = req.body;

    if (!shopDomain || !accessToken) {
      return res.status(400).json({ error: "Shop domain and access token required" });
    }

    const normalizedShopDomain = shopDomain.toLowerCase();


    req.fullUser.connectedShopDomain = normalizedShopDomain;
    req.fullUser.shopifyAccessToken = accessToken;
    await req.fullUser.save();

    res.json({ message: `Shopify store ${normalizedShopDomain} connected successfully.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to connect Shopify store" });
  }
});

router.post("/disconnect", authenticate, dualAuth, async (req, res) => {
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



router.get("/config", async (req, res) => {
  const { shopDomain } = req.query;
  if (!shopDomain) return res.status(400).json({ error: "Missing shopDomain" });

  try {
    const shopConfig = await ShopConfig.findOne({ shopDomain });
    res.json({ allowCustomerPDF: shopConfig?.allowCustomerPDF || false });
  } catch (err) {
    console.error("Failed to fetch Shopify config:", err);
    res.status(500).json({ error: "Failed to fetch config" });
  }
});



router.post("/settings", async (req, res) => {
  const { shopDomain, allowCustomerPDF } = req.body;
  if (!shopDomain) return res.status(400).json({ error: "Missing shopDomain" });

  try {
  const normalizedShopDomain = shopDomain.trim().toLowerCase();
const shopConfig = await ShopConfig.findOneAndUpdate(
  { shopDomain: normalizedShopDomain },
  { allowCustomerPDF },
  { upsert: true, new: true }
);

    res.json({ message: "Settings saved", allowCustomerPDF: shopConfig.allowCustomerPDF });
  } catch (err) {
    console.error("Failed to save Shopify settings:", err);
    res.status(500).json({ error: "Failed to save settings" });
  }
});


router.get("/orders", authenticate, dualAuth, async (req, res) => {
  const shopDomain = req.query.shopDomain;
  if (!shopDomain) return res.status(400).json({ error: "Missing shopDomain" });

  try {
    const token = await resolveShopifyToken(req, shopDomain);
    if (!token) return res.status(400).json({ error: "Missing Shopify access token" });

    const shopifyOrdersUrl = `https://${shopDomain}/admin/api/2023-10/orders.json?limit=10&status=any&fields=id,name,created_at`;
    const response = await axios.get(shopifyOrdersUrl, {
      headers: { "X-Shopify-Access-Token": token },
    });

    const orders = response.data.orders.map(o => ({
      id: o.id,
      name: o.name,
      date: new Date(o.created_at).toISOString().slice(0, 10),
    }));

    res.json({ orders });
  } catch (err) {
    console.error("❌ Failed to fetch orders:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});



module.exports = router;