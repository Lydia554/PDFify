const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const User = require("../../models/User");
const ShopConfig = require("../../models/ShopConfig");
const axios = require("axios");
const sendEmail = require("../../sendEmail");
const { enrichLineItemsWithImages } = require("./shopifyHelpers");
const { resolveLanguage } = require("../../utils/resolveLanguage");
const { incrementUsage } = require("../../utils/usageUtils");

// Shopify webhook verification
function verifyShopifyWebhook(req, res, next) {
  if (process.env.NODE_ENV !== "production") return next();

  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
  const body = req.rawBody;

  if (!hmacHeader || !body) return res.status(200).send("OK");

  const generatedHmac = crypto
    .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(body, "utf8")
    .digest("base64");

  if (generatedHmac !== hmacHeader) return res.status(200).send("OK");

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
    let parsedPayload;
    try {
      parsedPayload = JSON.parse(req.rawBody.toString());
    } catch {
      return res.status(200).send("OK");
    }

    const order = parsedPayload.order || parsedPayload;
    const shopDomain = (req.headers["x-shopify-shop-domain"] || parsedPayload.shopDomain)?.trim().toLowerCase();
    if (!shopDomain) return res.status(200).send("OK");

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
    } catch (err) {
      console.error("❌ Error in webhook async handler:", err);
    }
  }
);

async function processOrderAsync({ order, user, accessToken, shopDomain, lang, allowCustomerPDF }) {
  try {
    order.line_items = await enrichLineItemsWithImages(order.line_items, shopDomain, accessToken);

    const invoiceResponse = await axios.post(
      "https://pdfify.pro/api/shopify/invoice",
      { orderId: order.id, order, shopDomain, shopifyAccessToken: accessToken, lang, sendEmail: false },
      { headers: { Authorization: `Bearer ${user.getDecryptedApiKey()}` }, responseType: "arraybuffer" }
    );

    const pdfBuffer = Buffer.from(invoiceResponse.data);

    // Safely parse page count
    let pageCount = 1;
    const headerPageCount = invoiceResponse.headers["x-pdf-page-count"];
    if (headerPageCount) {
      const parsed = parseInt(headerPageCount, 10);
      if (!isNaN(parsed)) pageCount = parsed;
    }

    // Send PDF email and increment usage only if allowed
    if (!order.email) {
      console.warn(`⚠️ Order ${order.id} has no customer email, skipping PDF email and usage increment.`);
    } else if (!allowCustomerPDF) {
      console.log(`⚠️ Merchant has NOT approved customer PDFs for shop ${shopDomain}. Skipping PDF email and usage increment.`);
    } else {
      await sendEmail({
        to: order.email,
        subject: `Invoice for Shopify Order ${order.name || order.id}`,
        text: `Hello,\n\nYour invoice for order ${order.name || order.id} is attached.\n\nThanks for your purchase!`,
        attachments: [{ filename: `Invoice-${order.name || order.id}.pdf`, content: pdfBuffer, contentType: "application/pdf" }],
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
