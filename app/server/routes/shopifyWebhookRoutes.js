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



// Helper function to fetch product image
async function fetchProductImage(productId, shopDomain, accessToken) {
  try {
    const response = await axios.get(`https://${shopDomain}/admin/api/2024-01/products/${productId}.json`, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
      },
    });
    return response.data.product?.image?.src || null;
  } catch (err) {
    console.error(`❌ Failed to fetch image for product ${productId}:`, err.message);
    return null;
  }
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
    let order;
    const shopDomain = req.headers["x-shopify-shop-domain"];

    try {
      order = JSON.parse(req.rawBody.toString());
    } catch (err) {
      console.error("❌ Failed to parse raw body:", err);
      return res.status(400).send("Invalid request body");
    }

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

      // Respond immediately to avoid checkout timeout
      res.status(200).send("Webhook received");

      // Process invoice async (image fetching, PDF, email, etc.)
      processOrderAsync(order, user, connectedShopDomain);
    } catch (err) {
      console.error("❌ Error in webhook handler:", err);
      res.status(500).send("Internal Server Error");
    }
  }
);

// Async logic outside the route
async function processOrderAsync(order, user, shopDomain) {
  try {
    const accessToken = user.shopifyAccessToken;

    const enhancedLineItems = await Promise.all(
      order.line_items.map(async (item) => {
        if (!item.image?.src && item.product_id) {
          const imageUrl = await fetchProductImage(item.product_id, shopDomain, accessToken);
          return { ...item, image: { src: imageUrl } };
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

    console.log("✅ Order processed successfully for:", shopDomain);
  } catch (err) {
    console.error("❌ Error during async order processing:", err);
  }
}

// Fetch fallback product image
async function fetchProductImage(productId, shopDomain, accessToken) {
  try {
    const response = await axios.get(
      `https://${shopDomain}/admin/api/2023-10/products/${productId}.json`,
      {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      }
    );

    const images = response.data.product?.images;
    return images?.[0]?.src || null;
  } catch (err) {
    console.error(`❌ Failed to fetch product image for ${productId}:`, err.message);
    return null;
  }
}


module.exports = router;