const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const User = require("../models/User");
const sendEmail = require("../sendEmail");

// Middleware to verify Shopify Webhook
function verifyShopifyWebhook(req, res, next) {
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

// Webhook endpoint
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
    let order;
    const shopDomain = req.headers["x-shopify-shop-domain"];
    console.log("📦 Incoming webhook from:", shopDomain);

    try {
      order = JSON.parse(req.rawBody.toString());
      console.log("✅ Order JSON parsed:", order.id || "unknown");
    } catch (err) {
      console.error("❌ Failed to parse order JSON:", err);
      return res.status(200).send("OK");
    }

    if (!shopDomain || !order?.id) {
      console.error("❌ Missing shop domain or order ID");
      return res.status(200).send("OK");
    }

    res.status(200).send("Webhook received ✅");

    // Save order to file for inspection
    try {
      const logsDir = path.join(__dirname, "..", "logs");
      if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);
      const filePath = path.join(logsDir, "order-real.json");
      fs.writeFileSync(filePath, JSON.stringify(order, null, 2));
      console.log("📝 Real order received. Saved to logs/order-real.json");
    } catch (fileErr) {
      console.error("❌ Could not write order to JSON file:", fileErr.message);
    }

    const connectedShopDomain = shopDomain.trim().toLowerCase();

    try {
      const user = await User.findOne({ connectedShopDomain });
      if (!user) {
        console.error(`❌ No user found for ${connectedShopDomain}`);
        return;
      }

      console.log(`🧑 User found: ${user.email}`);
      processOrderAsync(order, user, connectedShopDomain);
    } catch (err) {
      console.error("❌ Error during user lookup or order handling:", err);
    }
  }
);

// Export the route
module.exports = router;
