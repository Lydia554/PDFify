const express = require("express");
const axios = require("axios");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const ShopConfig = require("../../models/ShopConfig");
const User = require("../../models/User");
const authenticate = require("../../middleware/authenticate");
const dualAuth = require("../../middleware/dualAuth");
const { resolveShopifyToken, getShopLogoUrl } = require("./shopifyHelpers");
const { resolveLanguage } = require("../../utils/resolveLanguage");
const { incrementUsage } = require("../../utils/usageUtils");
const { generateCustomerInvoiceHTML, formatPrice } = require("./customerInvoice");
const { mapOrderToPdfData, createMerchantPdf, getBase64Image } = require("./shopifyMerchantTemplate");
const { validatePdfWithVeraPdf } = require("../../Helpers/verapdf-validator");
const multer = require('multer');




const os = require("os");
const JSZip = require("jszip");

const router = express.Router();

// Multer configuration for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

require('dotenv').config();

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
  
  const invoiceData = mapOrderToPdfData(order, shopConfig, user);
  
  // Fetch logo from Shopify directly
  if (!token) token = await resolveShopifyToken(req, shopDomain);
  const logoUrl = await getShopLogoUrl(shopDomain, token);
  if (logoUrl) {
      console.log(`[Shopify Merchant Invoice] Fetched logo URL from Shopify: ${logoUrl}`);
      invoiceData.logoData = await getBase64Image(logoUrl);
  } else {
      console.log(`[Shopify Merchant Invoice] Could not fetch logo URL from Shopify.`);
  }

  const pdfBuffer = await createMerchantPdf(invoiceData);
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
      customLogoUrl: shopConfig.customLogoUrl,
      fallbackLogoUrl: "/assets/default-logo.png",
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

// ----------------------------
// Validate PDF/A-3b compliance
// ----------------------------
router.post("/validate-pdfa3b", upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No PDF file uploaded" });
    }

    const { autoFix = "false" } = req.body;
    const shouldAutoFix = autoFix === "true" || autoFix === true;

    console.log(`[Validate] PDF/A-3b validation request, size: ${req.file.size} bytes, autoFix: ${shouldAutoFix}`);

    // Validate PDF with veraPDF
    const result = await validatePdfWithVeraPdf(req.file.buffer, {
      autoFix: shouldAutoFix
    });

    // Build response
    const response = {
      success: true,
      validation: {
        compliant: result.compliant,
        profileName: result.profileName || 'PDF/A-3b',
        passCount: result.passCount,
        failCount: result.failCount,
        totalRules: result.totalRules,
        summary: result.summary,
        rules: result.rules.slice(0, 50), // Limit to first 50 rules for response size
        hasMoreRules: result.rules.length > 50
      }
    };

    // If auto-fix was attempted and successful, include fixed PDF
    if (result.fixedPdf) {
      response.validation.fixed = true;
      response.validation.afterFix = {
        compliant: result.compliant,
        passCount: result.passCount,
        failCount: result.failCount,
        totalRules: result.totalRules,
        summary: result.summary
      };
    }

    // Return JSON response for API
    if (req.query.download === "true" && result.fixedPdf) {
      // Download fixed PDF
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=validated-pdfa3b.pdf",
      });
      return res.send(result.fixedPdf);
    }

    res.json(response);

  } catch (err) {
    console.error("[Validate] PDF/A-3b validation error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Validation failed"
    });
  }
});

// ----------------------------
// Batch validate multiple PDFs
// ----------------------------
router.post("/validate-batch", upload.array('pdfs', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No PDF files uploaded" });
    }

    console.log(`[Validate] Batch validation request: ${req.files.length} files`);

    const results = [];

    for (const file of req.files) {
      const result = await validatePdfWithVeraPdf(file.buffer, {
        autoFix: false
      });

      results.push({
        filename: file.originalname,
        size: file.size,
        validation: {
          compliant: result.compliant,
          passCount: result.passCount,
          failCount: result.failCount,
          totalRules: result.totalRules,
          summary: result.summary
        }
      });
    }

    res.json({
      success: true,
      totalFiles: req.files.length,
      compliantCount: results.filter(r => r.validation.compliant).length,
      results
    });

  } catch (err) {
    console.error("[Validate] Batch validation error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Batch validation failed"
    });
  }
});


module.exports = router;