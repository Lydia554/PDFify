const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const User = require("../../models/User");
const ShopConfig = require("../../models/ShopConfig");
const axios = require("axios");
const puppeteer = require("puppeteer");
const sendEmail = require("../../sendEmail");
const { enrichLineItemsWithImages } = require("./shopifyHelpers");
const { resolveLanguage } = require("../../utils/resolveLanguage");
const { incrementUsage } = require("../../utils/usageUtils");

// ================================
// REQUEST LOGGING MIDDLEWARE
// Logs EVERY request to webhook endpoints
// ================================
router.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`\n${timestamp} ⚡ [WEBHOOK MIDDLEWARE] Incoming request`);
  console.log(`⚡ [WEBHOOK MIDDLEWARE] Method: ${req.method}`);
  console.log(`⚡ [WEBHOOK MIDDLEWARE] Path: ${req.path}`);
  console.log(`⚡ [WEBHOOK MIDDLEWARE] URL: ${req.originalUrl}`);
  console.log(`⚡ [WEBHOOK MIDDLEWARE] IP: ${req.ip}`);
  console.log(`⚡ [WEBHOOK MIDDLEWARE] Headers:`, JSON.stringify({
    "x-shopify-hmac-sha256": req.get("X-Shopify-Hmac-Sha256") ? 'Present' : 'Missing',
    "x-shopify-shop-domain": req.get("X-Shopify-Shop-Domain") || 'Not provided',
    "x-shopify-topic": req.get("X-Shopify-Topic") || 'Not provided',
    "x-shopify-api-version": req.get("X-Shopify-Api-Version") || 'Not provided',
    "content-type": req.get("Content-Type"),
    "user-agent": req.get("User-Agent"),
    "host": req.get("host")
  }, null, 2));
  next();
});

// Shopify webhook verification (ALWAYS verify, even in development)
function verifyShopifyWebhook(req, res, next) {
  const timestamp = new Date().toISOString();
  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
  const body = req.rawBody;
  const shopDomain = req.get("X-Shopify-Shop-Domain");

  // EXTENSIVE LOGGING for debugging
  console.log(`\n${timestamp} ===================== WEBHOOK REQUEST START =====================`);
  console.log(`🔐 [Webhook] Path: ${req.method} ${req.path}`);
  console.log(`🔐 [Webhook] Shop Domain: ${shopDomain || 'NOT PROVIDED'}`);
  console.log(`🔐 [Webhook] X-Shopify-Topic: ${req.get("X-Shopify-Topic") || 'NOT PROVIDED'}`);
  console.log(`🔐 [Webhook] X-Shopify-Api-Version: ${req.get("X-Shopify-Api-Version") || 'NOT PROVIDED'}`);
  console.log(`🔐 [Webhook] Content-Type: ${req.get("Content-Type")}`);
  console.log(`🔐 [Webhook] User-Agent: ${req.get("User-Agent")}`);
  console.log(`🔐 [Webhook] HMAC Header Present: ${hmacHeader ? 'YES' : 'NO'} (${hmacHeader ? hmacHeader.substring(0, 20) + '...' : 'N/A'})`);
  console.log(`🔐 [Webhook] Raw Body Length: ${body ? body.length : 0} bytes`);

  // CRITICAL: Reject requests without HMAC header or body (Shopify compliance requirement)
  if (!hmacHeader || !body) {
    console.error(`❌ [Webhook] MISSING HMAC OR BODY`);
    console.error(`   HMAC Present: ${!!hmacHeader}`);
    console.error(`   Body Present: ${!!body}`);
    console.error(`   Returning: 401 Unauthorized (Shopify compliance requirement)`);
    console.log(`===================== WEBHOOK REQUEST END (401) =====================\n`);
    return res.status(401).send("Unauthorized");
  }

  // Verify HMAC signature using timing-safe comparison to prevent timing attacks
  const generatedHmac = crypto
    .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(body, "utf8")
    .digest("base64");

  // Use timing-safe comparison to prevent timing attacks
  const hmacBuffer = Buffer.from(hmacHeader, "base64");
  const generatedBuffer = Buffer.from(generatedHmac, "base64");

  if (hmacBuffer.length !== generatedBuffer.length || !crypto.timingSafeEqual(hmacBuffer, generatedBuffer)) {
    console.error(`❌ [Webhook] HMAC VERIFICATION FAILED`);
    console.error(`   Generated HMAC: ${generatedHmac.substring(0, 30)}...`);
    console.error(`   Received HMAC:  ${hmacHeader.substring(0, 30)}...`);
    console.error(`   Match: NO`);
    console.error(`   SHOPIFY_WEBHOOK_SECRET exists: ${!!process.env.SHOPIFY_WEBHOOK_SECRET}`);
    console.error(`   SHOPIFY_WEBHOOK_SECRET length: ${process.env.SHOPIFY_WEBHOOK_SECRET?.length || 0}`);
    console.error(`   Returning: 401 Unauthorized`);
    console.log(`===================== WEBHOOK REQUEST END (401) =====================\n`);
    return res.status(401).send("Unauthorized");
  }

  console.log(`✅ [Webhook] HMAC VERIFIED SUCCESSFULLY`);
  console.log(`===================== WEBHOOK REQUEST START (Proceeding to handler) =====================\n`);
  next();
}

// Webhook for new orders
router.post(
  "/order-created",
  express.raw({
    type: "application/json",
    verify: (req, res, buf) => { req.rawBody = buf; },
  }),
  verifyShopifyWebhook,
  async (req, res) => {
    const timestamp = new Date().toISOString();
    console.log(`\n${timestamp} 📦 [ORDER/CREATED] Handler started`);
    console.log(`📦 [ORDER/CREATED] Headers:`, JSON.stringify({
      "x-shopify-shop-domain": req.get("X-Shopify-Shop-Domain"),
      "x-shopify-topic": req.get("X-Shopify-Topic"),
      "x-shopify-api-version": req.get("X-Shopify-Api-Version")
    }, null, 2));

    let parsedPayload;
    try {
      parsedPayload = JSON.parse(req.rawBody.toString());
      console.log(`📦 [ORDER/CREATED] Payload parsed successfully`);
    } catch (err) {
      console.error(`📦 [ORDER/CREATED] Failed to parse payload:`, err.message);
      return res.status(200).send("OK");
    }

    const order = parsedPayload.order || parsedPayload;
    const shopDomain = (req.headers["x-shopify-shop-domain"] || parsedPayload.shopDomain)?.trim().toLowerCase();
    if (!shopDomain) {
      console.error(`📦 [ORDER/CREATED] No shop domain found`);
      return res.status(200).send("OK");
    }

    console.log(`📦 [ORDER/CREATED] Shop: ${shopDomain}, Order: ${order.name || order.id}`);
    console.log(`📦 [ORDER/CREATED] Responding: 200 OK`);
    res.status(200).send("Webhook received");

    try {
      const user = await User.findOne({ connectedShopDomain: shopDomain });
      const shopConfig = await ShopConfig.findOne({ shopDomain });

      if (!user) return;

      const { lang } = await resolveLanguage({ req, order, shopDomain, shopConfig: shopConfig || {} });

      await processOrderAsync({
        order,
        user,
        accessToken: user.shopifyAccessToken,
        shopDomain,
        lang,
        allowCustomerPDF: shopConfig?.allowCustomerPDF || false
      });
      console.log(`📦 [ORDER/CREATED] Async processing completed`);
    } catch (err) {
      console.error(`❌ [ORDER/CREATED] Error in webhook handler:`, err);
    }
    console.log(`===================== [ORDER/CREATED] END =====================\n`);
  }
);

// ================================
// MANDATORY GDPR COMPLIANCE WEBHOOKS
// ================================

// customers/data_request - When customer requests copy of their data (GDPR right to access)
router.post(
  "/customers-data-request",
  express.raw({
    type: "application/json",
    verify: (req, res, buf) => { req.rawBody = buf; },
  }),
  verifyShopifyWebhook,
  async (req, res) => {
    const timestamp = new Date().toISOString();
    console.log(`\n${timestamp} 📋 [GDPR/CUSTOMERS_DATA_REQUEST] Handler started`);

    let parsedPayload;
    try {
      parsedPayload = JSON.parse(req.rawBody.toString());
    } catch {
      console.error(`📋 [GDPR/CUSTOMERS_DATA_REQUEST] Failed to parse payload`);
      return res.status(200).send("OK");
    }

    const shopDomain = (req.headers["x-shopify-shop-domain"] || parsedPayload.shopDomain)?.trim().toLowerCase();
    console.log(`📋 [GDPR/CUSTOMERS_DATA_REQUEST] Shop: ${shopDomain}`);

    console.log(`📋 [GDPR/CUSTOMERS_DATA_REQUEST] Responding: 200 OK`);
    res.status(200).send("OK");

    try {
      // Since we do NOT store customer data, there's nothing to return
      // Customer data is processed in real-time and not persisted
      console.log(`📋 [GDPR/CUSTOMERS_DATA_REQUEST] No customer data stored - processed in real-time only`);
    } catch (err) {
      console.error(`❌ [GDPR/CUSTOMERS_DATA_REQUEST] Error:`, err);
    }
    console.log(`===================== [GDPR/CUSTOMERS_DATA_REQUEST] END =====================\n`);
  }
);

// customers/redact - When customer requests deletion of their data (GDPR right to erasure)
router.post(
  "/customers-redact",
  express.raw({
    type: "application/json",
    verify: (req, res, buf) => { req.rawBody = buf; },
  }),
  verifyShopifyWebhook,
  async (req, res) => {
    const timestamp = new Date().toISOString();
    console.log(`\n${timestamp} 🗑️ [GDPR/CUSTOMERS_REDACT] Handler started`);

    let parsedPayload;
    try {
      parsedPayload = JSON.parse(req.rawBody.toString());
    } catch {
      console.error(`🗑️ [GDPR/CUSTOMERS_REDACT] Failed to parse payload`);
      return res.status(200).send("OK");
    }

    const shopDomain = (req.headers["x-shopify-shop-domain"] || parsedPayload.shopDomain)?.trim().toLowerCase();
    console.log(`🗑️ [GDPR/CUSTOMERS_REDACT] Shop: ${shopDomain}`);

    console.log(`🗑️ [GDPR/CUSTOMERS_REDACT] Responding: 200 OK`);
    res.status(200).send("OK");

    try {
      // Since we do NOT store customer data, there's nothing to delete
      // Customer data is processed in real-time and already deleted from memory after invoice generation
      console.log(`🗑️ [GDPR/CUSTOMERS_REDACT] No customer data stored - nothing to delete`);
    } catch (err) {
      console.error(`❌ [GDPR/CUSTOMERS_REDACT] Error:`, err);
    }
    console.log(`===================== [GDPR/CUSTOMERS_REDACT] END =====================\n`);
  }
);

// shop/redact - When merchant requests deletion of their shop data (app uninstall)
router.post(
  "/shop-redact",
  express.raw({
    type: "application/json",
    verify: (req, res, buf) => { req.rawBody = buf; },
  }),
  verifyShopifyWebhook,
  async (req, res) => {
    const timestamp = new Date().toISOString();
    console.log(`\n${timestamp} 🗑️ [GDPR/SHOP_REDACT] Handler started`);

    let parsedPayload;
    try {
      parsedPayload = JSON.parse(req.rawBody.toString());
    } catch {
      console.error(`🗑️ [GDPR/SHOP_REDACT] Failed to parse payload`);
      return res.status(200).send("OK");
    }

    const shopDomain = (req.headers["x-shopify-shop-domain"] || parsedPayload.shopDomain)?.trim().toLowerCase();
    console.log(`🗑️ [GDPR/SHOP_REDACT] Shop: ${shopDomain}`);

    console.log(`🗑️ [GDPR/SHOP_REDACT] Responding: 200 OK`);
    res.status(200).send("OK");

    try {
      // Delete all merchant data from our database
      const shopConfigDelete = await ShopConfig.findOneAndDelete({ shopDomain });
      const userDelete = await User.findOneAndDelete({ connectedShopDomain: shopDomain });

      if (shopConfigDelete) {
        console.log(`✅ [GDPR/SHOP_REDACT] Deleted ShopConfig for ${shopDomain}`);
      }
      if (userDelete) {
        console.log(`✅ [GDPR/SHOP_REDACT] Deleted User record for ${shopDomain}`);
      }

      if (!shopConfigDelete && !userDelete) {
        console.log(`ℹ️ [GDPR/SHOP_REDACT] No data found for ${shopDomain}`);
      }
    } catch (err) {
      console.error(`❌ [GDPR/SHOP_REDACT] Error:`, err);
    }
    console.log(`===================== [GDPR/SHOP_REDACT] END =====================\n`);
  }
);

// app/uninstalled - When app is uninstalled from shop (MANDATORY)
router.post(
  "/app-uninstalled",
  express.raw({
    type: "application/json",
    verify: (req, res, buf) => { req.rawBody = buf; },
  }),
  verifyShopifyWebhook,
  async (req, res) => {
    const timestamp = new Date().toISOString();
    console.log(`\n${timestamp} 🗑️ [APP/UNINSTALLED] Handler started`);

    let parsedPayload;
    try {
      parsedPayload = JSON.parse(req.rawBody.toString());
    } catch {
      console.error(`🗑️ [APP/UNINSTALLED] Failed to parse payload`);
      return res.status(200).send("OK");
    }

    const shopDomain = (req.headers["x-shopify-shop-domain"] || parsedPayload.shopDomain)?.trim().toLowerCase();
    console.log(`🗑️ [APP/UNINSTALLED] Shop: ${shopDomain}`);

    console.log(`🗑️ [APP/UNINSTALLED] Responding: 200 OK`);
    res.status(200).send("OK");

    try {
      // Mark shop as inactive and clear access token
      const shopConfigUpdate = await ShopConfig.findOneAndUpdate(
        { shopDomain },
        {
          isActive: false,
          uninstalledAt: new Date(),
          shopifyAccessToken: null
        }
      );

      // Clear access token from user if one exists
      const userUpdate = await User.findOneAndUpdate(
        { connectedShopDomain: shopDomain },
        {
          shopifyAccessToken: null,
          connectedShopDomain: null,
          planType: "free",
          isPremium: false
        }
      );

      if (shopConfigUpdate) {
        console.log(`✅ [APP/UNINSTALLED] Marked shop as inactive: ${shopDomain}`);
      }
      if (userUpdate) {
        console.log(`✅ [APP/UNINSTALLED] Cleared user access token: ${shopDomain}`);
      }

      if (!shopConfigUpdate && !userUpdate) {
        console.log(`ℹ️ [APP/UNINSTALLED] No data found for ${shopDomain}`);
      }
    } catch (err) {
      console.error(`❌ [APP/UNINSTALLED] Error:`, err);
    }
    console.log(`===================== [APP/UNINSTALLED] END =====================\n`);
  }
);

// ================================
// ORDER WEBHOOK
// ================================

async function processOrderAsync({ order, user, accessToken, shopDomain, lang, allowCustomerPDF }) {
  try {
    order.line_items = await enrichLineItemsWithImages(order.line_items, shopDomain, accessToken);

    console.log("📧 [Direct] Calling customer invoice generation directly (bypassing HTTP)...");

    // Import customer invoice generator
    const { generateCustomerInvoiceHTML, formatPrice: customerFormatPrice } = require("./customerInvoice");
    const localeMap = {
      sl: require("../../../locales/sl.json"),
      en: require("../../../locales/en.json"),
      de: require("../../../locales/de.json")
    };

    // Map order items (same logic as invoice route)
    const items = (order.line_items || []).map((item) => {
      const quantity = parseFloat(item.quantity || 1);
      const price = parseFloat(item.price || 0);
      const net = price * quantity;
      const tax = (item.tax_lines || []).reduce((sum, t) => sum + parseFloat(t.price || 0), 0);
      const total = net + tax;
      return { name: item.title || item.name || "Item", quantity, price, net, tax, total };
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
      customerEmail: order.email || "",
      iban: "DE89370400440532013000",
      currency: order.currency || "EUR"
    };

    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    const locale = localeMap[lang] || localeMap["en"];

    const htmlData = {
      ...invoiceData,
      items: items.map(i => ({
        ...i,
        formattedPrice: customerFormatPrice(i.price, order.currency || "EUR", lang || "en"),
        formattedNet: customerFormatPrice(i.net, order.currency || "EUR", lang || "en"),
        formattedTax: customerFormatPrice(i.tax, order.currency || "EUR", lang || "en"),
        formattedTotal: customerFormatPrice(i.total, order.currency || "EUR", lang || "en"),
      })),
      formattedSubtotal: customerFormatPrice(subtotal, order.currency || "EUR", lang || "en"),
      formattedTaxTotal: customerFormatPrice(taxTotal, order.currency || "EUR", lang || "en"),
      formattedTotal: customerFormatPrice(total, order.currency || "EUR", lang || "en"),
      shopName: shopDomain,
      currency: order.currency || "EUR",
      locale: lang || "en",
      customLogoUrl: "",
    };

    const html = generateCustomerInvoiceHTML(htmlData, true, lang, locale);
    await page.setContent(html, { waitUntil: "load", timeout: 15000 });
    await page.evaluateHandle("document.fonts.ready");

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "40px", bottom: "40px", left: "40px", right: "40px" },
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      pdfVersion: "1.4",
    });

    await browser.close();

    console.log("📧 [Direct] PDF generated successfully, size:", pdfBuffer.length, "bytes");
    console.log("📧 [Direct] PDF starts with %PDF:", pdfBuffer.toString("utf8", 0, 4) === "%PDF");

    // Page count (always 1 for customer invoices)
    let pageCount = 1;

    // Send PDF email and increment usage only if allowed
    if (!order.email) {
      console.warn(`⚠️ Order ${order.id} has no customer email, skipping PDF email and usage increment.`);
    } else if (!allowCustomerPDF) {
      console.log(`⚠️ Merchant has NOT approved customer PDFs for shop ${shopDomain}. Skipping PDF email and usage increment.`);
    } else {
      const attachment = {
        filename: `Invoice-${order.name || order.id}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf"
      };

      console.log("📧 [Email] Preparing to send email with PDF attachment:");
      console.log("📧 [Email] - To:", order.email);
      console.log("📧 [Email] - Filename:", attachment.filename);
      console.log("📧 [Email] - Attachment size:", attachment.content.length, "bytes");
      console.log("📧 [Email] - Content type:", attachment.contentType);

      await sendEmail({
        to: order.email,
        subject: `Invoice for Shopify Order ${order.name || order.id}`,
        text: `Hello,\n\nYour invoice for order ${order.name || order.id} is attached.\n\nThanks for your purchase!`,
        attachments: [attachment],
      });
      console.log(`✉️ Customer PDF SENT for order ${order.id} to ${order.email}`);

      // Increment usage only after sending PDF
      try {
        await incrementUsage(user, false, pageCount);
        console.log(`📄 Invoice page count: ${pageCount}, usage updated for user ${user.email}`);
      } catch (err) {
        console.error(`❌ Failed to increment usage for user ${user.email}:`, err);
      }
    }

    console.log(`✅ Finished processing order: ${order.id}`);
  } catch (err) {
    console.error("❌ Error during async order processing:", err);
  }
}

module.exports = router;
