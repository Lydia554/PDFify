const express = require("express");
const fs = require("fs");
const crypto = require("crypto");
const axios = require("axios");
const router = express.Router();

const User = require("../models/User");
const sendEmail = require("../sendEmail");

// Shopify webhook verification middleware
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

// Webhook route
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

    try {
      order = JSON.parse(req.rawBody.toString());
    } catch (err) {
      console.error("❌ Failed to parse raw body:", err);
      return res.status(200).send("OK");
    }

    // Save raw order for debugging
    fs.writeFileSync("order-real.json", JSON.stringify(order, null, 2));
    console.log("📝 Real order received. Saved to order-real.json");

    if (!shopDomain || !order?.id) {
      console.error("❌ Missing shop domain or order ID");
      return res.status(200).send("OK");
    }

    res.status(200).send("Webhook received"); // Respond immediately

    const connectedShopDomain = shopDomain.trim().toLowerCase();

    try {
      const user = await User.findOne({ connectedShopDomain });
      if (!user) {
        console.error(`❌ No user found for domain: ${connectedShopDomain}`);
        return;
      }

      console.log(`🔐 Found user ${user.email || user._id} for shop ${connectedShopDomain}`);
      await processOrderAsync(order, user, connectedShopDomain);
    } catch (err) {
      console.error("❌ Webhook handler error:", err);
    }
  }
);

// Process order
async function processOrderAsync(order, user, shopDomain) {
  try {
    const accessToken = user.shopifyAccessToken;
    if (!accessToken) {
      console.error("❌ Missing Shopify access token for user", user._id);
      return;
    }

    console.log("📦 Processing order:", order.name || order.id);
    console.log("🧾 Line items preview:", order.line_items.map(item => ({
      title: item.title,
      product_id: item.product_id,
      hasImage: Boolean(item.image?.src),
    })));

    // Enhance line items
    const enhancedLineItems = await Promise.all(
      order.line_items.map(async (item) => {
        if (!item.image?.src && item.product_id) {
          const imageUrl = await fetchProductImage(item.product_id, shopDomain, accessToken);
          console.log(`🖼️ Image fetched for product ${item.product_id}:`, imageUrl || "Not found");
          return { ...item, image: { src: imageUrl } };
        } else if (!item.product_id) {
          console.warn(`⚠️ No product_id for line item: "${item.title}"`);
        }
        return item;
      })
    );

    order.line_items = enhancedLineItems;

    // Call your PDF API
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
      console.warn("⚠️ No user email found for sending invoice.");
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

    console.log("✅ Invoice emailed successfully for", order.name || order.id);
  } catch (err) {
    console.error("❌ Error processing order asynchronously:", err.message || err);
  }
}

// Fetch image
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
    console.error(`❌ Failed to fetch product image for ${productId}: ${err.response?.status || err.message}`);
    return null;
  }
}

module.exports = router;
