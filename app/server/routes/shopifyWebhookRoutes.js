const express = require("express");
const fs = require("fs");
const router = express.Router();
const User = require("../models/User");

router.post(
  "/order-created",
  express.raw({
    type: "application/json",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
  async (req, res) => {
    console.warn("🔔 Received Shopify webhook");

    let order;
    const shopDomain = req.headers["x-shopify-shop-domain"];
    console.warn("📦 Shop domain:", shopDomain);

    try {
      order = JSON.parse(req.rawBody.toString());
      console.warn("✅ Parsed order:", order.id || "No ID");
    } catch (err) {
      console.error("❌ Failed to parse order:", err.message);
      return res.status(200).send("OK");
    }

    try {
      fs.writeFileSync("order-real.json", JSON.stringify(order, null, 2));
      console.warn("📝 Order saved to order-real.json");
    } catch (err) {
      console.error("❌ Could not write order-real.json:", err.message);
    }

    if (!shopDomain || !order?.id) {
      console.error("❌ Missing shop domain or order ID");
      return res.status(200).send("OK");
    }

    res.status(200).send("Webhook received");

    try {
      const connectedShopDomain = shopDomain.trim().toLowerCase();
      const user = await User.findOne({ connectedShopDomain });

      if (!user) {
        console.error("❌ No user found for domain:", connectedShopDomain);
        return;
      }

      console.warn("🔐 Found user:", user.email || user._id);

      await processOrderAsync(order, user, connectedShopDomain);
    } catch (err) {
      console.error("❌ Uncaught webhook error:", err.message);
    }
  }
);


module.exports = router;
