const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const User = require("../models/User");
const axios = require("axios");
const sendEmail = require("../sendEmail");
const {
  enrichLineItemsWithImages,
} = require("../utils/shopifyHelpers");

// Middleware: Verify Shopify HMAC
function verifyShopifyWebhook(req, res, next) {
  if (process.env.NODE_ENV !== "production") {
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

  next();
}



async function fetchStoreLogoUrlCombined(shop, accessToken) {
  const apiBase = `https://${shop}/admin/api/2023-10`;

  // 1. Try to get logo URL from metafield
  async function getLogoFromMetafield() {
    try {
      const metafieldsRes = await axios.get(`${apiBase}/metafields.json`, {
        headers: { "X-Shopify-Access-Token": accessToken },
        params: { namespace: "custom", key: "store_logo_url" },
      });
      const metafields = metafieldsRes.data.metafields;
      if (metafields.length > 0 && metafields[0].value) {
        console.log("🖼️ Logo found in metafield:", metafields[0].value);
        return metafields[0].value;
      }
      console.log("⚠️ No logo URL metafield found.");
      return null;
    } catch (err) {
      console.error("❌ Error fetching metafield:", err.message);
      return null;
    }
  }

  // 2. Fallback: get logo from theme settings
  async function getLogoFromThemeSettings() {
    try {
      // Get main theme
      const themesRes = await axios.get(`${apiBase}/themes.json`, {
        headers: { "X-Shopify-Access-Token": accessToken },
      });
      const mainTheme = themesRes.data.themes.find((t) => t.role === "main");
      if (!mainTheme) throw new Error("Main theme not found");

      // Get settings_data.json
      const assetRes = await axios.get(`${apiBase}/themes/${mainTheme.id}/assets.json`, {
        headers: { "X-Shopify-Access-Token": accessToken },
        params: { "asset[key]": "config/settings_data.json" },
      });
      const settings = JSON.parse(assetRes.data.asset.value);

      // Keys to check for logo path
      const keysToCheck = [
        "settings.logo",
        "settings.logo_image",
        "settings.logo_header",
        "settings.header_logo",
        "settings.brand.logo",
      ];

      let logoPath = null;
      for (const key of keysToCheck) {
        const parts = key.split(".");
        let val = settings;
        for (const p of parts) {
          val = val?.[p];
          if (!val) break;
        }
        if (val) {
          logoPath = val;
          break;
        }
      }
      if (!logoPath) {
        console.warn("⚠️ Logo not found in theme settings.");
        return null;
      }

      // Resolve full URL
      if (
        logoPath.startsWith("http://") ||
        logoPath.startsWith("https://") ||
        logoPath.startsWith("//")
      ) {
        return logoPath.startsWith("//") ? "https:" + logoPath : logoPath;
      } else if (logoPath.startsWith("/")) {
        return `https://${shop}${logoPath}`;
      } else {
        return `https://${shop}/assets/${logoPath}`;
      }
    } catch (err) {
      console.error("❌ Error fetching logo from theme settings:", err.message);
      return null;
    }
  }

  // Main logic
  let logoUrl = await getLogoFromMetafield();
  if (logoUrl) return logoUrl;

  console.log("🔄 Falling back to theme settings...");
  logoUrl = await getLogoFromThemeSettings();
  if (logoUrl) return logoUrl;

  console.warn("⚠️ No store logo found anywhere.");
  return null;
}




// Webhook handler
router.post(
  "/order-created",
  express.raw({
    type: "application/json",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
  (req, res, next) => next(),
  verifyShopifyWebhook,
  async (req, res) => {
    let parsedPayload;
    try {
      parsedPayload = JSON.parse(req.rawBody.toString());
      console.log("📦 Parsed full payload:", JSON.stringify(parsedPayload, null, 2));
    } catch (err) {
      console.error("❌ Failed to parse JSON body:", err);
      return res.status(200).send("OK");
    }

    const order = parsedPayload.order || parsedPayload;
    const shopDomain = req.headers["x-shopify-shop-domain"] || parsedPayload.shopDomain;

    if (!shopDomain) {
      console.error("❌ Missing shop domain");
      return res.status(200).send("OK");
    }

    res.status(200).send("Webhook received");

    try {
      const connectedShopDomain = shopDomain.trim().toLowerCase();
      const user = await User.findOne({ connectedShopDomain });

      if (!user) {
        console.error(`❌ No user found for connectedShopDomain: ${connectedShopDomain}`);
        return;
      }

      await processOrderAsync({
        order,
        user,
        accessToken: user.shopifyAccessToken,
        shopDomain: connectedShopDomain,
      });

    } catch (err) {
      console.error("❌ Error in webhook async handler:", err);
    }
  }
);

// Core async processing logic
async function processOrderAsync({ order, user, accessToken, shopDomain }) {
  try {
    order.line_items = await enrichLineItemsWithImages(order.line_items, shopDomain, accessToken);

    // 🔍 Fetch the logo from theme settings
    const logoUrl = await fetchStoreLogoUrl(shopDomain, accessToken);
    console.log("🖼️ Logo URL:", logoUrl);

    const invoiceResponse = await axios.post(
      "https://pdf-api.portfolio.lidija-jokic.com/api/shopify/invoice",
      {
        orderId: order.id,
        order,
        shopDomain,
        shopifyAccessToken: accessToken,
        logoUrl, // 🚀 Include logo URL for PDF rendering
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

    user.usageCount = (user.usageCount || 0) + 1;
    await user.save();
    console.log("💾 User usage count incremented and saved");
    console.log("✅ Finished processing order:", order.id);

  } catch (err) {
    console.error("❌ Error during async order processing:", err);
  }
}

module.exports = router;
