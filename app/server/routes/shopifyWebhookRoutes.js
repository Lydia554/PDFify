const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const User = require("../models/User");
const axios = require("axios");
const sendEmail = require("../sendEmail");

// Middleware to verify Shopify webhook HMAC signature
function verifyShopifyWebhook(req, res, next) {
  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
  const body = req.rawBody; // raw body stored by express json 'verify' option below

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

router.post("/order-created", verifyShopifyWebhook, async (req, res) => {
  const shopDomain = req.headers["x-shopify-shop-domain"];
  const order = req.body;

  console.log("🧾 Order webhook received");
  console.log("🏪 x-shopify-shop-domain:", shopDomain);
  console.log("📦 Order payload:", JSON.stringify(order, null, 2));

  if (!shopDomain || !order || !order.id) {
    console.error("❌ Missing shop domain or order ID");
    return res.status(400).send("Missing shop domain or order payload");
  }

  const connectedShopDomain = shopDomain.trim().toLowerCase();

  try {
    const user = await User.findOne({ connectedShopDomain: normalizedShopDomain });

    if (!user) {
      console.error(`❌ No user found for ${normalizedShopDomain}`);
      return res.status(404).send("User not found");
    }
    
    // Use the model method to decrypt the API key
    const userApiKey = user.getDecryptedApiKey();
    
    if (!userApiKey) {
      console.error(`❌ No API key found for user ${user._id} (${connectedShopDomain})`);
      return res.status(403).send("User API key not found");
    }
    
    const invoiceResponse = await axios.post(
      "https://pdf-api.portfolio.lidija-jokic.com/api/shopify/invoice",
      {
        order,
        shopDomain: connectedShopDomain,
        shopifyAccessToken: user.shopifyAccessToken,
      },
      {
        headers: {
          Authorization: `Bearer ${userApiKey}`,  // <-- decrypted key here
        },
        responseType: "arraybuffer",
      }
    );
    

    const pdfBuffer = Buffer.from(invoiceResponse.data, "binary");

    // Send email with PDF invoice attached
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

    // Increment usage count for this user
    user.usageCount = (user.usageCount || 0) + 1;
    await user.save();

    res.status(200).send("Invoice generated and emailed.");
  } catch (err) {
    console.error("❌ Error in webhook handler:", err);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;
