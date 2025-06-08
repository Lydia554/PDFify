const express = require("express");
const axios = require("axios");
const User = require("../models/User");
const router = express.Router();
const crypto = require("crypto");
const sendEmail = require("../sendEmail");
require("dotenv").config();

/**
 * Verify Shopify webhook using HMAC and raw body
 */
function verifyShopifyWebhook(req, rawBody) {
  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;

  const hash = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  if (hash !== hmacHeader) {
    throw new Error("Webhook HMAC validation failed");
  }
}

router.post("/order-created", async (req, res) => {
  try {
    // req.body is a Buffer here (raw body)
    verifyShopifyWebhook(req, req.body);

    // Parse JSON from raw buffer
    const order = JSON.parse(req.body.toString("utf-8"));
    const shopDomain = req.headers["x-shopify-shop-domain"];

    console.log("🧾 Order webhook received");
    console.log("🏪 x-shopify-shop-domain:", shopDomain);
    console.log("📦 Order payload:", JSON.stringify(order, null, 2));

    if (!shopDomain || !order || !order.id) {
      console.error("❌ Missing shop domain or order ID");
      return res.status(400).send("Missing shop domain or order payload");
    }

    const normalizedShopDomain = shopDomain.trim().toLowerCase();
    console.log("🔍 Searching for connectedShopDomain:", normalizedShopDomain);

    const allUsers = await User.find({}, "email connectedShopDomain");
    console.log("🗃️ Registered users:");
    allUsers.forEach((u) => {
      console.log(` - ${u.email}: ${u.connectedShopDomain}`);
    });

    const user = await User.findOne({
      connectedShopDomain: normalizedShopDomain,
    });

    if (!user || !user.shopifyAccessToken) {
      console.error(`❌ No user or token found for ${normalizedShopDomain}`);
      return res.status(404).send("User or token not found");
    }

    // Call internal invoice endpoint to generate PDF
    const invoiceResponse = await axios.post(
      "https://pdf-api.portfolio.lidija-jokic.com/shopify/invoice",
      { orderId: order.id },
      {
        headers: {
          "x-shopify-shop-domain": normalizedShopDomain,
          "x-shopify-access-token": user.shopifyAccessToken,
        },
        responseType: "arraybuffer",
      }
    );

    const pdfBuffer = Buffer.from(invoiceResponse.data, "binary");

    // Send email with PDF attached
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

    // Increment usage count
    user.usageCount = (user.usageCount || 0) + 1;
    await user.save();

    res.status(200).send("Invoice generated and emailed.");
  } catch (err) {
    if (err.message === "Webhook HMAC validation failed") {
      console.error("❌ Invalid webhook signature");
      return res.status(401).send("Unauthorized webhook");
    }
    console.error("❌ Error in webhook handler:", err);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;
