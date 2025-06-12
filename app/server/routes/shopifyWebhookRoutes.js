const express = require("express");
const fs = require("fs");
const router = express.Router();

router.post("/order-created", express.json(), async (req, res) => {
  try {
    const now = new Date().toISOString();

    // Safe fallback body
    const order = req.body || {};

    fs.writeFileSync("order-test.json", JSON.stringify({ timestamp: now, order }, null, 2));

    console.warn("✅ Order webhook HIT:", order.id || "no order ID");
    console.warn("📝 Body:", JSON.stringify(order, null, 2));

    res.status(200).send("Webhook received");

    // Optional fake email log
    if (order.id) {
      console.warn(`📧 Pretending to send email for order ${order.id}`);
    }
  } catch (err) {
    console.error("❌ Error inside /order-created:", err.message || err);
    res.status(200).send("OK (error)");
  }
});

module.exports = router;
