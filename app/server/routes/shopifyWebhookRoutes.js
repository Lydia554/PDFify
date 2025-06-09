const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const User = require("../models/User");
const axios = require("axios");
const sendEmail = require("../sendEmail");



function verifyShopifyWebhook(req, res, next) {
  console.log("HEADERS:", req.headers);
  console.log("X-Shopify-Hmac-Sha256:", req.get("X-Shopify-Hmac-Sha256"));
  console.log("RAW BODY:", req.rawBody ? req.rawBody.toString() : "NO RAW BODY");

  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
  const body = req.rawBody;

  if (!hmacHeader || !body) {
    console.error("Missing HMAC header or raw body");
    return res.status(401).send("Unauthorized");
  }

  const generatedHmac = crypto
    .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(body, "utf8")
    .digest("base64");

  if (generatedHmac !== hmacHeader) {
    console.error("Invalid HMAC signature");
    return res.status(401).send("Unauthorized");
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
  verifyShopifyWebhook,
  async (req, res) => {
   
    const order = JSON.parse(req.rawBody.toString());

    const shopDomain = req.headers["x-shopify-shop-domain"];
    console.log("🧾 Order webhook received");
    console.log("🏪 x-shopify-shop-domain:", shopDomain);
    console.log("📦 Order payload:", JSON.stringify(order, null, 2));

    if (!shopDomain || !order || !order.id) {
      console.error("❌ Missing shop domain or order ID");
      return res.status(400).send("Missing shop domain or order payload");
    }

    const connectedShopDomain = shopDomain.trim().toLowerCase();

    try {
      const user = await User.findOne({ connectedShopDomain });

      if (!user) {
        console.error(`❌ No user found for ${connectedShopDomain}`);
        return res.status(404).send("User not found");
      }

      const userApiKey = user.getDecryptedApiKey();

      if (!userApiKey) {
        console.error(`❌ No API key found for user ${user._id} (${connectedShopDomain})`);
        return res.status(403).send("User API key not found");
      }


      console.log("📤 Sending internal POST to /shopify/invoice with API key:", userApiKey);

      const invoiceResponse = await axios.post(
        "https://pdf-api.portfolio.lidija-jokic.com/api/shopify/invoice",
        {
          orderId: order.id,
          order,
          shopDomain: connectedShopDomain,
          shopifyAccessToken: user.shopifyAccessToken,
        },
        {
          headers: {
            Authorization: `Bearer ${userApiKey}`,
          },
          responseType: "arraybuffer",
        }
      );


      console.log("📥 Invoice response received, length:", invoiceResponse.data.length);

      const pdfBuffer = Buffer.from(invoiceResponse.data, "binary");

      await sendEmail({
        to: user.email,
        subject: `Invoice for Shopify Order ${order.name || order.id}`,
        text: `Hello ${user.name || ""},\n\nYour invoice for order ${order.name || order.id} is attached.\n\nThanks for using PDFify!`,
        attachments: [
          {
            filename: `Invoice-${order.name || order.id}.pdf`,
            content: pdfBuffer,
            contentType: "application/pdf",
          },
        ],
      });

      console.log("✅ Email with invoice sent to", user.email);

      user.usageCount = (user.usageCount || 0) + 1;
      await user.save();

      res.status(200).send("Invoice generated and emailed.");
    } catch (err) {
      console.error("❌ Error in webhook handler:", err);
      res.status(500).send("Internal Server Error");
    }
  }
);

module.exports = router;