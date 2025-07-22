const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const User = require("../models/User");
const axios = require("axios");
const sendEmail = require("../sendEmail");
const { getTranslations } = require("../utils/i18n");

const {
  enrichLineItemsWithImages,
} = require("../utils/shopifyHelpers");



function verifyShopifyWebhook(req, res, next) {
  if (process.env.NODE_ENV !== "production") {
    return next();
  }

  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
  const body = req.rawBody;

  if (!hmacHeader || !body) {
    console.error("❌ Missing HMAC header or raw body");
    return res.status(200).send("OK"); 
  }

  const generatedHmac = crypto
    .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(body, "utf8")
    .digest("base64");

  if (generatedHmac !== hmacHeader) {
    console.error("❌ Invalid HMAC signature");
    return res.status(200).send("OK");
  }

  next();
}

router.post(
  "/order-created",
  express.raw({
    type: "application/json",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
  (req, res, next) => {
    next();
  },
  verifyShopifyWebhook,
  async (req, res) => {

    let parsedPayload;
    try {
      parsedPayload = JSON.parse(req.rawBody.toString());
      console.log("📦 Parsed full payload:", JSON.stringify(parsedPayload, null, 2));
    } catch (err) {
      console.error("❌ Failed to parse JSON body:", err);
      return res.status(200).send("OK");
    }

    const order = parsedPayload.order || parsedPayload;


 
    const shopDomain = req.headers["x-shopify-shop-domain"] || parsedPayload.shopDomain;
    if (!shopDomain) {
      console.error("❌ Missing shop domain");
      return res.status(200).send("OK");
    }
   

  
    res.status(200).send("Webhook received");

    try {
      const connectedShopDomain = shopDomain.trim().toLowerCase();
      const lang = (order.customer?.locale || 'en').slice(0, 2);
const t = getTranslations(lang);


      const user = await User.findOne({ connectedShopDomain });
      if (!user) {
        console.error(`❌ No user found for connectedShopDomain: ${connectedShopDomain}`);
        return;
      }
  

     await processOrderAsync({ order, user, accessToken: user.shopifyAccessToken, shopDomain: connectedShopDomain });

    } catch (err) {
      console.error("❌ Error in webhook async handler:", err);
    }
  }
);



async function processOrderAsync({ order, user, accessToken, shopDomain }) {
  try {

   order.line_items = await enrichLineItemsWithImages(order.line_items, shopDomain, accessToken);



    const invoiceResponse = await axios.post(
      "https://pdfify.pro/api/shopify/invoice",
      {
        orderId: order.id,
        order,
        shopDomain,
        shopifyAccessToken: accessToken,
        lang
      },
      {
        headers: {
          Authorization: `Bearer ${user.getDecryptedApiKey()}`,
        },
        responseType: "arraybuffer",
      }
    );

    const pdfBuffer = Buffer.from(invoiceResponse.data, "binary");
    console.log("📄 Received PDF invoice buffer");

    await sendEmail({
      to: order.email,
      subject: `Invoice for Shopify Order ${order.name || order.id}`,
      text: `Hello,\n\nYour invoice for order ${order.name || order.id} is attached.\n\nThanks for your purchase!`,
      attachments: [
        {
          filename: `Invoice-${order.name || order.id}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    console.log(`✉️ Email sent to ${order.email}`);

  
    user.usageCount = (user.usageCount || 0) + 1;
    await user.save();
    console.log("💾 User usage count incremented and saved");

    console.log("✅ Finished processing order:", order.id);
  } catch (err) {
    console.error("❌ Error during async order processing:", err);
  }
}





module.exports = router;
