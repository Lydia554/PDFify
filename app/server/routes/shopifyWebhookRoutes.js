const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const User = require("../models/User");
const axios = require("axios");
const sendEmail = require("../sendEmail");
const {
  enrichLineItemsWithImages,
} = require("../utils/shopifyHelpers");



function verifyShopifyWebhook(req, res, next) {
  if (process.env.NODE_ENV !== "production") {
    console.log("⚠️ Skipping HMAC verification in non-production environment");
    return next();
  }

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

  console.log("✅ HMAC signature verified");
  next();
}

router.post(
  "/order-created",
  express.raw({
    type: "application/json",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
  (req, res, next) => {
    console.log("🚨 Webhook POST /order-created received");
    console.log("Headers:", req.headers);
    console.log("Raw body snippet:", req.rawBody.toString().substring(0, 200));
    next();
  },
  verifyShopifyWebhook,
  async (req, res) => {
    console.log("✅ Passed HMAC verification");

    let parsedPayload;
    try {
      parsedPayload = JSON.parse(req.rawBody.toString());
      console.log("📦 Parsed full payload:", JSON.stringify(parsedPayload, null, 2));
    } catch (err) {
      console.error("❌ Failed to parse JSON body:", err);
      return res.status(200).send("OK");
    }

    const order = parsedPayload.order || parsedPayload;

    console.log("🆔 Parsed order ID:", order.id || order.name || "(no id)");

 
    const shopDomain = req.headers["x-shopify-shop-domain"] || parsedPayload.shopDomain;
    if (!shopDomain) {
      console.error("❌ Missing shop domain");
      return res.status(200).send("OK");
    }
    console.log("🏪 Shop domain:", shopDomain);

  
    res.status(200).send("Webhook received");

    try {
      const connectedShopDomain = shopDomain.trim().toLowerCase();

      const user = await User.findOne({ connectedShopDomain });
      if (!user) {
        console.error(`❌ No user found for connectedShopDomain: ${connectedShopDomain}`);
        return;
      }
      console.log(`🔐 Found user: ${user.email}`);

     await processOrderAsync({ order, user, accessToken: user.shopifyAccessToken, shopDomain: connectedShopDomain });
      console.log("✅ Order processing initiated for user:", user.email);
    } catch (err) {
      console.error("❌ Error in webhook async handler:", err);
    }
  }
);
async function fetchProductImages(shop, accessToken, productId) {
  try {
    console.log(`🔍 Fetching images for product ID ${productId} from shop ${shop}`);
    console.log(`🔐 Using access token: ${accessToken?.slice(0, 6)}...`);

    const res = await axios.get(`https://${shop}/admin/api/2023-10/products/${productId}/images.json`, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });

    console.log(`📸 Shopify returned ${res.data.images?.length || 0} image(s) for product ${productId}`);
    if (res.data.images?.length > 0) {
      console.log("🖼️ First image URL:", res.data.images[0].src);
    }

    return res.data.images || [];
  } catch (err) {
    console.error(`❌ Failed to fetch images for product ${productId}:`, err.response?.status, err.message);
    return [];
  }
}

async function processOrderAsync({ order, user, accessToken, shopDomain }) {
  try {
    // STEP 1: Enhance order.line_items with product images
    console.log("🧪 Enhancing line_items with product images...");
   order.line_items = await enrichLineItemsWithImages(order.line_items, shopDomain, accessToken);


    console.log("📦 Final order.line_items with image fields:");
    console.log(JSON.stringify(order.line_items, null, 2));

    // STEP 2: Request the PDF from your API
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
    console.log("📄 Received PDF invoice buffer");

    // STEP 3: Send to the customer
    await sendEmail({
      to: order.email,
      subject: `Invoice for Shopify Order ${order.name || order.id}`,
      text: `Hello,\n\nYour invoice for order ${order.name || order.id} is attached.\n\nThanks for your purchase!`,
      attachments: [
        {
          filename: `Invoice-${order.name || order.id}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    console.log(`✉️ Email sent to ${order.email}`);

    // STEP 4: Track usage
    user.usageCount = (user.usageCount || 0) + 1;
    await user.save();
    console.log("💾 User usage count incremented and saved");

    console.log("✅ Finished processing order:", order.id);
  } catch (err) {
    console.error("❌ Error during async order processing:", err);
  }
}





module.exports = router;
