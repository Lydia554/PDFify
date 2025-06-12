const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const User = require("../models/User");
const axios = require("axios");
const sendEmail = require("../sendEmail");

// Shopify webhook verification middleware
function verifyShopifyWebhook(req, res, next) {
  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
  const body = req.rawBody;

  if (!hmacHeader || !body) {
    console.error(JSON.stringify({
      level: "error",
      msg: "Missing HMAC header or raw body",
      event: "webhook_verify_fail",
    }));
    return res.status(200).send("OK"); // Respond 200 to avoid retries
  }

  const generatedHmac = crypto
    .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(body, "utf8")
    .digest("base64");

  if (generatedHmac !== hmacHeader) {
    console.error(JSON.stringify({
      level: "error",
      msg: "Invalid HMAC signature",
      event: "webhook_verify_fail",
    }));
    return res.status(200).send("OK");
  }

  next();
}

// POST /webhook/order-created
router.post(
  "/order-created",
  // Parse raw body for HMAC verification and JSON parsing
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
      console.error(JSON.stringify({
        level: "error",
        msg: "Failed to parse raw body",
        error: err.message,
        event: "webhook_parse_fail",
      }));
      return res.status(200).send("OK");
    }

    if (!shopDomain || !order || !order.id) {
      console.error(JSON.stringify({
        level: "error",
        msg: "Missing shop domain or order ID",
        event: "webhook_invalid_payload",
      }));
      return res.status(200).send("OK");
    }

    console.log(JSON.stringify({
      level: "info",
      msg: "Shopify webhook received",
      shopDomain,
      orderId: order.id,
      event: "webhook_received",
    }));

    // Immediately respond 200 to Shopify to avoid retries
    res.status(200).send("Webhook received");

    const connectedShopDomain = shopDomain.trim().toLowerCase();

    try {
      const user = await User.findOne({ connectedShopDomain });
      if (!user) {
        console.error(JSON.stringify({
          level: "error",
          msg: `No user found for connectedShopDomain: ${connectedShopDomain}`,
          event: "webhook_user_not_found",
        }));
        return;
      }

      // Run order processing async but catch errors internally
      processOrderAsync(order, user, connectedShopDomain);
    } catch (err) {
      console.error(JSON.stringify({
        level: "error",
        msg: "Webhook handler error",
        error: err.message || err,
        event: "webhook_handler_error",
      }));
    }
  }
);

async function processOrderAsync(order, user, shopDomain) {
  try {
    const accessToken = user.shopifyAccessToken;
    if (!accessToken) {
      console.error(JSON.stringify({
        level: "error",
        msg: "Missing Shopify access token",
        userId: user._id,
        event: "process_order_fail",
      }));
      return;
    }

    console.log(JSON.stringify({
      level: "info",
      msg: "Processing order async",
      orderId: order.id,
      userId: user._id,
      event: "process_order_start",
    }));

    // Enrich line items with images if missing
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

    // Call PDF API to generate invoice
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
      console.warn(JSON.stringify({
        level: "warn",
        msg: "User email missing, cannot send invoice",
        userId: user._id,
        event: "process_order_warn",
      }));
      return;
    }

    // Send invoice by email
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

    console.log(JSON.stringify({
      level: "info",
      msg: "Invoice processed and emailed",
      orderId: order.id,
      userId: user._id,
      event: "process_order_success",
    }));
  } catch (err) {
    console.error(JSON.stringify({
      level: "error",
      msg: "Error during async order processing",
      error: err.message || err,
      event: "process_order_error",
    }));
  }
}

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
    console.error(JSON.stringify({
      level: "error",
      msg: `Failed to fetch product image for ${productId}`,
      error: err.message,
      event: "fetch_product_image_error",
    }));
    return null;
  }
}

module.exports = router;
