const express = require("express");
const fs = require("fs");
const path = require("path");

const axios = require("axios");
const router = express.Router();

const User = require("../models/User");
const sendEmail = require("../sendEmail");



// Shopify Order Created Webhook Route
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
    const shopDomain = req.headers["x-shopify-shop-domain"];
    let order;

    try {
      order = JSON.parse(req.rawBody.toString());
    } catch (err) {
      console.error("❌ Failed to parse order body:", err.message);
      return res.status(200).send("OK");
    }

    // Save raw order for inspection
    try {
      const logsDir = path.join(__dirname, "..", "logs");
      if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);
      const filePath = path.join(logsDir, "order-real.json");
      fs.writeFileSync(filePath, JSON.stringify(order, null, 2));
      console.info("📝 Order saved to logs/order-real.json");
    } catch (fileErr) {
      console.error("❌ Failed to save order JSON:", fileErr.message);
    }

    if (!shopDomain || !order?.id) {
      console.warn("⚠️ Missing shop domain or order ID in webhook.");
      return res.status(200).send("OK");
    }

    res.status(200).send("Webhook received"); // Respond quickly to Shopify

    const connectedShopDomain = shopDomain.trim().toLowerCase();

    try {
      const user = await User.findOne({ connectedShopDomain });
      if (!user) {
        console.warn(`⚠️ No user found for domain: ${connectedShopDomain}`);
        return;
      }

      console.info(`🔐 User found: ${user.email || user._id} for ${connectedShopDomain}`);
      await processOrderAsync(order, user, connectedShopDomain);
    } catch (err) {
      console.error("❌ Failed during user lookup or processing:", err.message);
    }
  }
);

// Async order processor
async function processOrderAsync(order, user, shopDomain) {
  try {
    const accessToken = user.shopifyAccessToken;
    if (!accessToken) {
      console.warn("⚠️ Missing Shopify access token for user:", user._id);
      return;
    }

    console.info(`📦 Processing order ${order.name || order.id}`);

    const enhancedLineItems = await Promise.all(
      order.line_items.map(async (item) => {
        if (!item.image?.src && item.product_id) {
          const imageUrl = await fetchProductImage(item.product_id, shopDomain, accessToken);
          console.info(`🖼️ Image for ${item.title}: ${imageUrl || "None found"}`);
          return { ...item, image: { src: imageUrl } };
        }

        if (!item.product_id) {
          console.warn(`⚠️ No product_id for item: ${item.title}`);
        }

        return item;
      })
    );

    order.line_items = enhancedLineItems;

    const invoiceResponse = await axios.post(
      "https://pdf-api.portfolio.lidija-jokic.com/api/shopify/invoice",
      {
        orderId: order.id,
        order,
        shopDomain,
        shopifyAccessToken: accessToken,
      },
      {
        headers: {
          Authorization: `Bearer ${user.getDecryptedApiKey()}`,
        },
        responseType: "arraybuffer",
      }
    );

    const pdfBuffer = Buffer.from(invoiceResponse.data, "binary");

    if (!user.email) {
      console.warn("⚠️ No user email available for sending invoice.");
      return;
    }

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

    user.usageCount = (user.usageCount || 0) + 1;
    await user.save();

    console.info(`✅ Invoice sent and usage updated for ${order.name || order.id}`);
  } catch (err) {
    console.error("❌ Error during async order processing:", err.message);
  }
}

// Shopify product image fetcher
async function fetchProductImage(productId, shopDomain, accessToken) {
  try {
    const apiUrl = `https://${shopDomain}/admin/api/2024-01/products/${productId}.json`;

    const response = await axios.get(apiUrl, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    });

    return response.data.product?.images?.[0]?.src || null;
  } catch (err) {
    console.error(`❌ Failed to fetch product image ${productId}:`, err.response?.status || err.message);
    return null;
  }
}

module.exports = router;
