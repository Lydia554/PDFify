const express = require("express");
const axios = require("axios");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ShopConfig = require("../../models/ShopConfig");
const User = require("../../models/User");
const authenticate = require("../../middleware/authenticate");
const dualAuth = require("../../middleware/dualAuth");
const { resolveShopifyToken, getShopLogoUrl } = require("./shopifyHelpers");
const { resolveLanguage } = require("../../utils/resolveLanguage");
const { incrementUsage } = require("../../utils/usageUtils");
const { generateCustomerInvoiceHTML, formatPrice: customerFormatPrice } = require("./customerInvoice");
const { createPdfA3WithJava } = require("../../Helpers/pdf-helpers");
const generateZugferdXml = require("../../../xml/generateZugferdXml");

const os = require("os");
const JSZip = require("jszip");

const router = express.Router();

require('dotenv').config();

// ----------------------------
// Helper Functions
// ----------------------------

/**
 * Formats a number as a currency string.
 * @param {number} amount - The amount to format.
 * @param {string} currency - The currency code (e.g., "USD", "EUR").
 * @param {string} locale - The locale string (e.g., "en-US", "de-DE").
 * @returns {string} The formatted currency string.
 */
function formatPrice(amount, currency = "EUR", locale = "en-US") {
  if (typeof amount !== 'number') {
    amount = parseFloat(amount);
  }
  if (isNaN(amount)) {
    return "";
  }
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
}

/**
 * Convert image URL (PNG, JPG, or SVG) to base64 string for embedding in PDF
 * @param {string} url
 * @returns {Promise<string>} Base64 encoded PNG image or empty string
 */
async function getBase64Image(url) {
  if (!url) return '';
  try {
    console.log("🔍 Fetching logo for merchant invoice:", url);
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 10000,
      validateStatus: (status) => status === 200
    });

    // Validate we received image data
    const buffer = Buffer.from(response.data);
    if (buffer.length === 0) {
      console.error("❌ Logo fetch returned empty buffer");
      return '';
    }

    // Use sharp to ensure it's a PNG, converting SVG if necessary
    const imageBuffer = await sharp(buffer).png().toBuffer();

    // Validate the PNG conversion worked
    if (!imageBuffer || imageBuffer.length < 8) {
      console.error("❌ Logo PNG conversion failed or produced invalid data");
      return '';
    }

    // Verify PNG signature
    if (imageBuffer[0] !== 0x89 || imageBuffer[1] !== 0x50 ||
        imageBuffer[2] !== 0x4E || imageBuffer[3] !== 0x47) {
      console.error("❌ Logo data does not have valid PNG signature");
      return '';
    }

    // Convert to base64 string
    const base64 = imageBuffer.toString('base64');

    console.log("✅ Logo processed successfully, size:", imageBuffer.length, "bytes");
    return base64;
  } catch (err) {
    console.error("❌ Error fetching or processing logo:", url, err.message);
    return '';
  }
}

/**
 * Map Shopify order → PDF data for Java service
 * @param {object} order - Shopify order object
 * @param {object} shopConfig - Shop configuration
 * @param {object} user - User object
 * @returns {object} Invoice data for Java service
 */
function mapOrderToPdfData(order, shopConfig = {}, user = {}) {
  const shopDomain = user?.connectedShopDomain;
  const prettyShopName = shopDomain ? shopDomain.split('.')[0].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : "Your Shop";

  const items = (order.line_items || []).map((item, index) => {
    const price = parseFloat(item.price || 0);
    const quantity = parseFloat(item.quantity || 1);
    const tax = (item.tax_lines || []).reduce((sum, t) => sum + parseFloat(t.price || 0), 0);
    const net = price * quantity;
    const total = net + tax;
    const currency = order.currency || "EUR";
    const locale = shopConfig.locale || "en-US";

    return {
      position: index + 1,
      name: item.title || item.name || "Item",
      quantity,
      unitCode: "EA",
      price,
      formattedPrice: formatPrice(price, currency, locale),
      net,
      formattedNet: formatPrice(net, currency, locale),
      tax,
      formattedTax: formatPrice(tax, currency, locale),
      total,
      formattedTotal: formatPrice(total, currency, locale),
      taxRate: 21,
      currency,
    };
  });

  const subtotal = items.reduce((sum, i) => sum + i.net, 0);
  const taxTotal = items.reduce((sum, i) => sum + i.tax, 0);
  const total = subtotal + taxTotal;
  const currency = order.currency || "EUR";
  const locale = shopConfig.locale || "en-US";

  return {
    orderId: order.name || order.id,
    date: order.created_at ? new Date(order.created_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    customerName: `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim() || "Valued Customer",
    customerEmail: order.customer?.email,
    customerAddress: order.shipping_address ?
                      `${order.shipping_address.address1}, ${order.shipping_address.city}, ${order.shipping_address.zip || ''}, ${order.shipping_address.country}` :
                      (order.billing_address ?
                        `${order.billing_address.address1}, ${order.billing_address.city}, ${order.billing_address.zip || ''}, ${order.billing_address.country}` :
                        "Customer Address Not Available"),
    items,
    subtotal,
    formattedSubtotal: formatPrice(subtotal, currency, locale),
    tax: taxTotal,
    formattedTaxTotal: formatPrice(taxTotal, currency, locale),
    total,
    formattedTotal: formatPrice(total, currency, locale),
    vatRate: 21,
    currency,
    iban: shopConfig.iban || "DE89370400440532013000",
    bic: shopConfig.bic || "COBADEFFXXX",
    bankName: shopConfig.bankName || "",
    paymentTerms: order.payment?.terms || "Due within 14 days",
    creator: "PDFify",
    companyName: shopConfig.companyName || prettyShopName,
    shopName: shopConfig.shopName || prettyShopName,
    shopAddress: shopConfig.shopAddress || "123 Main St, Anytown, Country",
    primaryColor: shopConfig.primaryColor || "#00a6cc", // Custom color from shop config
    locale: { language: order.locale || "en", format: locale },
  };
}

// ----------------------------
// Generate invoice PDF
// ----------------------------
router.post("/invoice", authenticate, dualAuth, async (req, res) => {
  try {
    const shopDomain = req.body.shopDomain || req.headers["x-shopify-shop-domain"];
    if (!shopDomain) return res.status(400).json({ error: "Missing shop domain" });

    let orderId = req.body.orderId;
    let order = req.body.order || null;
    let token;

    // Fetch Shopify order if not provided
    if (!order && orderId) {
      token = await resolveShopifyToken(req, shopDomain);
      if (!token) return res.status(400).json({ error: "Missing Shopify access token" });

      if (typeof orderId === "string" && orderId.startsWith("gid://")) {
        orderId = orderId.split("/").pop();
      }

      const resp = await axios.get(`https://${shopDomain}/admin/api/2023-10/orders/${orderId}.json`, {
        headers: { "X-Shopify-Access-Token": token },
      });
      order = resp.data.order;
    }

    if (!order || !order.line_items) {
      return res.status(400).json({ error: "Invalid or missing order data" });
    }

    const shopConfig = (await ShopConfig.findOne({ shopDomain })) || {};
    const { lang } = await resolveLanguage({ req, order, shopDomain, shopConfig });

    const user = req.user?.userId
      ? await User.findById(req.user.userId)
      : await User.findOne({ connectedShopDomain: shopDomain });
    if (!user) return res.status(404).json({ error: "User not found" });

    const isPreview = req.query.preview === "true";
    const isMerchant = req.query.merchant === "true";

    // Map order items
    const items = (order.line_items || []).map((item) => {
      const quantity = parseFloat(item.quantity || 1);
      const price = parseFloat(item.price || 0);
      const net = price * quantity;
      const tax = (item.tax_lines || []).reduce((sum, t) => sum + parseFloat(t.price || 0), 0);
      const total = net + tax;
      return { name: item.title || item.name || "Item", quantity, price, net, tax, total, taxRate: 21 };
    });

    const subtotal = items.reduce((sum, i) => sum + i.net, 0);
    const taxTotal = items.reduce((sum, i) => sum + i.tax, 0);
    const total = subtotal + taxTotal;

    const invoiceData = {
      orderId: order.name || order.id,
      date: order.created_at ? new Date(order.created_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      items,
      subtotal,
      tax: taxTotal,
      total,
      vatRate: 21,
      customerName: `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim() || "Valued Customer",
      iban: shopConfig.iban || "DE89370400440532013000",
      bic: shopConfig.bic || "COBADEFFXXX",
      paymentTerms: order.payment?.terms || "Due within 14 days",
      creator: "PDFify",
      locale: { language: lang || "en" },
    };

    let pdfBuffer;


if (isMerchant) {
try {
  console.log("🧾 [Shopify] Generating merchant PDF for:", order?.id || order?.name);
  console.log("🧾 [Shopify] Order name:", order?.name, "Order ID:", order?.id);
  console.log("🧾 [Shopify] Customer:", order?.customer?.first_name, order?.customer?.last_name);
  console.log("🧾 [Shopify] Line items:", order?.line_items?.length);

  const invoiceData = mapOrderToPdfData(order, shopConfig, user);

  console.log("🧾 [Shopify] Mapped invoiceData - orderId:", invoiceData.orderId);
  console.log("🧾 [Shopify] Mapped invoiceData - customerName:", invoiceData.customerName);
  console.log("🧾 [Shopify] Mapped invoiceData - items:", invoiceData.items?.length);
  console.log("🧾 [Shopify] Mapped invoiceData - total:", invoiceData.total);

  // Generate ZUGFeRD XML for paying customers (premium + pro)
  const isPayingCustomer = user && (user.planType === "pro" || user.planType === "premium");

  if (isPayingCustomer) {
    try {
      console.log(`🧾 [Shopify] Generating ZUGFeRD XML for ${user.planType} user...`);
      const zugferdData = {
        orderId: invoiceData.orderId,
        date: invoiceData.date,
        currency: invoiceData.currency,
        customerName: invoiceData.customerName,
        companyName: invoiceData.companyName,
        iban: invoiceData.iban,
        items: invoiceData.items,
        subtotal: invoiceData.subtotal,
        tax: invoiceData.tax,
        total: invoiceData.total,
        sellerAddress: {
          postCode: "12345", // Should come from shopConfig
          street: invoiceData.shopAddress || "Main Street 1",
          city: "Anytown",
          country: "DE"
        },
        buyerAddress: {
          postCode: "12345",
          street: invoiceData.customerAddress?.split(',')[0] || "Customer Street 1",
          city: invoiceData.customerAddress?.split(',')[1] || "Customerton",
          country: invoiceData.customerAddress?.split(',')[3] || "DE"
        },
        sellerVatId: "DE123456789", // Should come from shopConfig
        vatRate: invoiceData.vatRate || 21
      };
      invoiceData.zugferdXml = generateZugferdXml(zugferdData);
      console.log("🧾 [Shopify] ZUGFeRD XML generated:", invoiceData.zugferdXml.length, "bytes");
    } catch (zugferdErr) {
      console.error("🧾 [Shopify] Failed to generate ZUGFeRD XML:", zugferdErr.message);
      // Continue without XML
    }
  } else {
    console.log("🧾 [Shopify] Skipping ZUGFeRD XML for free user");
  }

  // Fetch logo from Shopify directly
  if (!token) token = await resolveShopifyToken(req, shopDomain);
  const logoUrl = await getShopLogoUrl(shopDomain, token);
  if (logoUrl) {
      console.log(`[Shopify Merchant Invoice] Fetched logo URL from Shopify: ${logoUrl}`);
      const logoBase64 = await getBase64Image(logoUrl);
      // Only add logoData if it was successfully fetched and is valid
      if (logoBase64 && logoBase64.length > 0) {
          invoiceData.logoData = logoBase64;
          console.log(`[Shopify Merchant Invoice] Logo added to invoice (${logoBase64.length} bytes base64)`);
      } else {
          console.log(`[Shopify Merchant Invoice] Logo fetch returned empty data, skipping logo`);
          delete invoiceData.logoData;
      }
  } else {
      console.log(`[Shopify Merchant Invoice] Could not fetch logo URL from Shopify.`);
  }

  const filename = `Invoice_${invoiceData.orderId}_${Date.now()}.pdf`;
  pdfBuffer = await createPdfA3WithJava(invoiceData, filename);
  console.log(`📄 Merchant PDF generated, size: ${pdfBuffer.length} bytes`);

  const safeOrderId = (invoiceData.orderId || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename=Invoice-${safeOrderId}.pdf`,
  });
  return res.send(pdfBuffer);
} catch (err) {
  console.error("❌ Merchant PDF generation failed:", err);
  return res.status(500).json({ error: "Merchant PDF generation failed", details: err.message });
}

}

    // ----------------------------
    // Customer PDF (Puppeteer HTML → PDF)
    // ----------------------------
    if (!shopConfig.allowCustomerPDF) {
      return res.status(403).json({ error: "Customer PDFs are not allowed by this merchant" });
    }

    const htmlData = {
      ...invoiceData,
      items: items.map(i => ({
        ...i,
        formattedPrice: formatPrice(i.price, order.currency || "EUR", lang || "en"),
        formattedNet: formatPrice(i.net, order.currency || "EUR", lang || "en"),
        formattedTax: formatPrice(i.tax, order.currency || "EUR", lang || "en"),
        formattedTotal: formatPrice(i.total, order.currency || "EUR", lang || "en"),
      })),
      formattedSubtotal: formatPrice(subtotal, order.currency || "EUR", lang || "en"),
      formattedTaxTotal: formatPrice(taxTotal, order.currency || "EUR", lang || "en"),
      formattedTotal: formatPrice(total, order.currency || "EUR", lang || "en"),
      shopName: shopConfig.shopName || shopDomain,
      currency: order.currency || "EUR",
      locale: lang || "en",
      customLogoUrl: shopConfig.customLogoUrl || "",
    };

    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    const html = generateCustomerInvoiceHTML(htmlData, true, lang, {});
    await page.setContent(html, { waitUntil: "networkidle0" });

    // Generate PDF directly from Puppeteer
    pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: 40, bottom: 40, left: 40, right: 40 },
      tagged: true,
    });

    await browser.close();
    await incrementUsage(user, 1, isPreview);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": isPreview ? "inline" : `attachment; filename=${invoiceData.orderId}.pdf`,
    });
    res.send(pdfBuffer);

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

  const fromDate = req.query.from; 
  const toDate = req.query.to;     

  try {
    const token = await resolveShopifyToken(req, shopDomain);
    if (!token) return res.status(400).json({ error: "Missing Shopify access token" });

    let shopifyOrdersUrl = `https://${shopDomain}/admin/api/2023-10/orders.json?limit=50&status=any&fields=id,name,created_at`;

    
    const params = [];
    if (fromDate) params.push(`created_at_min=${encodeURIComponent(fromDate + "T00:00:00Z")}`);
    if (toDate) params.push(`created_at_max=${encodeURIComponent(toDate + "T23:59:59Z")}`);
    if (params.length) shopifyOrdersUrl += `&${params.join("&")}`;

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

router.post("/invoices/zip", authenticate, dualAuth, async (req, res) => {
  try {
    const { shopDomain, from, to } = req.body;
    if (!shopDomain) return res.status(400).json({ error: "Missing shopDomain" });

    const token = await resolveShopifyToken(req, shopDomain);
    if (!token) return res.status(400).json({ error: "Missing Shopify access token" });

    // Fetch orders
    let shopifyOrdersUrl = `https://${shopDomain}/admin/api/2023-10/orders.json?limit=50&status=any&fields=id,name,created_at`;
    const params = [];
    if (from) params.push(`created_at_min=${encodeURIComponent(from + "T00:00:00Z")}`);
    if (to) params.push(`created_at_max=${encodeURIComponent(to + "T23:59:59Z")}`);
    if (params.length) shopifyOrdersUrl += `&${params.join("&")}`;

    const response = await axios.get(shopifyOrdersUrl, { headers: { "X-Shopify-Access-Token": token } });
    const orders = response.data.orders;
    if (!orders.length) return res.status(404).json({ error: "No orders found in this range" });

    const zip = new JSZip();
    const user = req.fullUser;

    // Process orders
    for (const order of orders) {
      let fullOrder = order;
      if (!fullOrder.line_items) {
        const fullOrderResp = await axios.get(
          `https://${shopDomain}/admin/api/2023-10/orders/${order.id}.json`,
          { headers: { "X-Shopify-Access-Token": token } }
        );
        fullOrder = fullOrderResp.data.order;
      }

      // 1️⃣ Generate PDF + XML
      const { pdfBuffer, xmlContent } = await createShopifyInvoiceZugferd(fullOrder, {}, "shopify");

      // 2️⃣ Safe filenames
      const safeOrderId = (fullOrder.name || fullOrder.id || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");

      // 3️⃣ Add to ZIP
      zip.file(`Invoice-${safeOrderId}.pdf`, pdfBuffer);
      zip.file(`ZUGFeRD-${safeOrderId}.xml`, xmlContent);
    }

    // Increment usage
    await incrementUsage(user, orders.length, false);

    // Generate ZIP buffer
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename=Invoices_${from || "start"}_to_${to || "end"}.zip`,
    });
    res.send(zipBuffer);

  } catch (err) {
    console.error("Failed to generate ZIP:", err);
    res.status(500).json({ error: "Failed to generate ZIP" });
  }
});


module.exports = router;