const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const User = require("../models/User");
const axios = require("axios");
const sendEmail = require("../sendEmail");



// Verify HMAC signature
function verifyShopifyWebhook(req, res, next) {
  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
  const body = req.rawBody;

  if (!hmacHeader || !body) {
    console.error("❌ Missing HMAC header or raw body");
    return res.status(200).send("OK"); // Don't block Shopify
  }

  const generatedHmac = crypto
    .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(body, "utf8")
    .digest("base64");

  if (generatedHmac !== hmacHeader) {
    console.error("❌ Invalid HMAC signature");
    return res.status(200).send("OK"); // Don't block Shopify
  }

  next();
}

// Shopify webhook endpoint
router.post( "/order-created", express.raw({type: "application/json",verify: (req, res, buf) => {req.rawBody = buf;
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
      return res.status(200).send("OK"); // Still respond
    }

    if (!shopDomain || !order || !order.id) {
      console.error("❌ Missing shop domain or order ID");
      return res.status(200).send("OK");
    }

    // Always respond immediately
    res.status(200).send("Webhook received");

    // Continue processing in background
    const connectedShopDomain = shopDomain.trim().toLowerCase();

    try {
      const user = await User.findOne({ connectedShopDomain });
      if (!user) {
        console.error(`❌ No user found for ${connectedShopDomain}`);
        return;
      }

      processOrderAsync(order, user, connectedShopDomain);
    } catch (err) {
      console.error("❌ Webhook handler error:", err);
    }
  }
);

// Async processing (PDF + email)
async function processOrderAsync(order, user, shopDomain) {
  try {
    const accessToken = user.shopifyAccessToken;

    // Enhance line items with images if missing
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

    // Request PDF from external API
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

    // Email the invoice
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

    console.log("✅ Invoice processed and emailed for", order.name || order.id);
  } catch (err) {
    console.error("❌ Error during async order processing:", err);
  }
}

// Product image fallback
async function fetchProductImage(productId, shopDomain, accessToken) {
  try {
    const response = await axios.get(
      `https://${shopDomain}/admin/api/2024-01/products/${productId}.json`,
      {
        headers: {
          "X-Shopify-Access-Token": accessToken,
        },
      }
    );
    return response.data.product?.images?.[0]?.src || null;
  } catch (err) {
    console.error(`❌ Failed to fetch product image for ${productId}:`, err.message);
    return null;
  }
}

module.exports = router;