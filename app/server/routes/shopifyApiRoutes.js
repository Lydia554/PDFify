const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const pdfParse = require("pdf-parse");
const ShopConfig = require("../models/ShopConfig");
const User = require("../models/User"); 
const { PDFDocument } = require("pdf-lib");
const authenticate = require("../middleware/authenticate"); 
const dualAuth = require("../middleware/dualAuth");
const {resolveShopifyToken} = require("../utils/shopifyHelpers");
const { resolveLanguage } = require("../utils/resolveLanguage");
require('dotenv').config();
const FORCE_PLAN = process.env.FORCE_PLAN || null;



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






router.post("/invoice", authenticate, dualAuth, async (req, res) => {
  try {
    const shopDomain = req.body.shopDomain || req.headers["x-shopify-shop-domain"];
    if (!shopDomain) return res.status(400).json({ error: "Missing shop domain" });

    const token = await resolveShopifyToken(req, shopDomain);
    if (!token) return res.status(400).json({ error: "Missing Shopify access token" });

    let orderId = req.body.orderId;
    let order = req.body.order || null;

    if (typeof orderId === "string" && orderId.startsWith("gid://")) {
      orderId = orderId.split("/").pop();
    }

    if (!order && orderId) {
      const shopifyOrderUrl = `https://${shopDomain}/admin/api/2023-10/orders/${orderId}.json`;
      try {
        const orderResponse = await axios.get(shopifyOrderUrl, {
          headers: {
            "X-Shopify-Access-Token": token,
            "Content-Type": "application/json",
          },
        });
        order = orderResponse.data.order;
      } catch (err) {
        console.error("❌ Failed to fetch order from Shopify:", err.response?.data || err.message);
        return res.status(500).json({ error: "Failed to fetch order from Shopify" });
      }
    }

    if (!order || !order.line_items) {
      return res.status(400).json({ error: "Invalid or missing order data" });
    }


    const shopConfig = await ShopConfig.findOne({ shopDomain }) || {};
const { lang, t } = await resolveLanguage({ req, order, shopDomain, shopConfig });


    
    if (!orderId && order?.id) {
      orderId = order.id;
    }

    let user = req.user?.userId
      ? await User.findById(req.user.userId)
      : await User.findOne({ connectedShopDomain: shopDomain });

    if (!user) return res.status(404).json({ error: "User not found for this shop" });


    
const isPreview = req.query.preview === "true";
const isPremium = FORCE_PLAN === "pro" || FORCE_PLAN === "true" || FORCE_PLAN === "1";


console.log("🧾 Shopify order currency:", order.currency);


const currency = order.currency || "EUR";

const localeMap = {
  de: "de-DE",
  en: "en-US",
  sl: "sl-SI",
};
const locale = localeMap[lang] || "en-US";

let subtotal = 0;
let taxTotal = 0;

if (Array.isArray(order.tax_lines)) {
  taxTotal = order.tax_lines.reduce((sum, line) => {
    const price = parseFloat(line.price);
    return sum + (isNaN(price) ? 0 : price);
  }, 0);
}

const enrichedItems = order.line_items.map(item => {
  const price = parseFloat(item.price);
  const quantity = parseFloat(item.quantity);
  const safePrice = isNaN(price) ? 0 : price;
  const safeQuantity = isNaN(quantity) ? 0 : quantity;
  const itemTotal = safePrice * safeQuantity;
  subtotal += itemTotal;

  return {
    ...item,
    price: safePrice,
    quantity: safeQuantity,
    formattedPrice: formatPrice(safePrice, currency, locale),
    formattedTotal: formatPrice(itemTotal, currency, locale),
  };
});

const rawTotal = subtotal + taxTotal;


const customerName = `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim();

const shippingAddress = order.shipping_address
  ? `${order.shipping_address.address1 || ""}, ${order.shipping_address.zip || ""} ${order.shipping_address.city || ""}, ${order.shipping_address.country || ""}`
  : "N/A";

const billingAddress = order.billing_address
  ? `${order.billing_address.address1 || ""}, ${order.billing_address.zip || ""} ${order.billing_address.city || ""}, ${order.billing_address.country || ""}`
  : "N/A";


const invoiceData = {
  shopName: shopConfig?.shopName || shopDomain || "Unnamed Shop",
  date: new Date(order.created_at).toISOString().slice(0, 10),
  items: enrichedItems,
  subtotal,
  taxTotal,
  total: rawTotal,
  formattedSubtotal: formatPrice(subtotal, currency, locale),
  formattedTaxTotal: formatPrice(taxTotal, currency, locale),
  formattedTotal: formatPrice(rawTotal, currency, locale),
  showChart: isPremium && shopConfig?.showChart,
  customLogoUrl: isPremium ? shopConfig?.customLogoUrl : null,
  fallbackLogoUrl: "/assets/default-logo.png",
   customerName,
  shippingAddress,
  billingAddress,
  currency,
  locale,
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

const html = generateInvoiceHTML(invoiceData, isPremium, lang, t);

await page.setContent(html, { waitUntil: "networkidle0" });
await page.pdf({
  path: pdfPath,
  format: "A4",
  printBackground: true,
  margin: { top: "40px", bottom: "40px", left: "40px", right: "40px" },
  displayHeaderFooter: false,
});

await browser.close();


await new Promise((res) => setTimeout(res, 100));


let pdfBuffer = fs.readFileSync(pdfPath);
let retries = 0;
while (pdfBuffer.length < 1000 && retries < 5) {
  await new Promise((res) => setTimeout(res, 100)); 
  pdfBuffer = fs.readFileSync(pdfPath);
  retries++;
}

const pdfDoc = await PDFDocument.load(pdfBuffer);
const pageCount = pdfDoc.getPageCount();
console.log(`📄 Shopify invoice page count: ${pageCount}`);

const { sendEmail: shouldSendEmail = true } = req.body;


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
    if (order.email && shouldSendEmail) {
  await sendEmail({
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


        console.log("✅ Invoice emailed to:", order.email);
      } else {
        console.warn("⚠️ No email found on order, skipping email");
      }
    } catch (emailErr) {
      console.error("❌ Failed to send invoice email:", emailErr);
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
    console.error("❌ Shopify invoice generation error:", error);
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


module.exports = router;