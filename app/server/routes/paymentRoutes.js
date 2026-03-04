const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const axios = require("axios");
const router = express.Router();

// Debug: Log Stripe key (first 7 and last 4 chars only for security)
console.log("[DEBUG] Stripe Secret Key loaded:", process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.substring(0, 7) + "..." + process.env.STRIPE_SECRET_KEY.slice(-4) : "NOT SET");
const authenticate = require("../middleware/authenticate");
const dualAuth = require("../middleware/dualAuth");
const verifyShopifySession = require("../middleware/verifyShopifySession");
const User = require("../models/User");
const ShopConfig = require("../models/ShopConfig");

const log = (msg, data = null) => {
  if (process.env.NODE_ENV !== "production") console.log(msg, data);
};

const PRICE_IDS = {
  premium: "price_1RbKxxJqMBxMksyPbeeE33I9",
  pro: "price_1RbKYnJqMBxMksyPjOLtaiBt",
};

// Token pack prices
const TOKEN_PRICE_IDS = {
  "1000": "price_1S93JEJqMBxMksyPopZlO5L6",
  "5000": "price_1S93JfJqMBxMksyPoCLyx9ih",
  "10000": "price_1S93KIJqMBxMksyP8kWbGXqL"
};

// --- Create subscription checkout session ---
router.post("/create-checkout-session", async (req, res) => {
  const { email, plan } = req.body;

  if (!email || !plan || !PRICE_IDS[plan]) {
    return res.status(400).json({ error: "Invalid plan or email provided" });
  }

  try {
    log("Creating subscription checkout session:", { email, plan });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [{ price: PRICE_IDS[plan], quantity: 1 }],
      mode: "subscription",
      success_url: `${process.env.SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CANCEL_URL}`,
    });

    log("Stripe subscription session created:", session.id);
    res.json({ id: session.id });
  } catch (err) {
    console.error("Error creating subscription checkout session:", err);
    res.status(500).json({ error: err.message });
  }
});


router.post("/buy-tokens", authenticate, async (req, res) => {
  const { pack } = req.body;
  const user = await User.findById(req.user.userId);

  if (!user) return res.status(404).json({ error: "User not found" });
  if (!TOKEN_PRICE_IDS[pack]) return res.status(400).json({ error: "Invalid token pack" });

  console.log("Creating checkout for user:", user.email, "pack:", pack);

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{ price: TOKEN_PRICE_IDS[pack], quantity: 1 }],
      mode: "payment",
      customer_email: user.email,
      success_url: `${process.env.SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CANCEL_URL}`,
      metadata: {
        userId: user._id.toString(),
        priceId: TOKEN_PRICE_IDS[pack],
      },
    });

    console.log("Stripe session created:", session.url);
    res.json({ url: session.url });
  } catch (err) {
    console.error("❌ Error creating token checkout:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- Shopify-specific token purchase (using Stripe) ---
router.post("/buy-tokens-shopify", verifyShopifySession, async (req, res) => {
  const { pack, email } = req.body;
  // shopDomain is extracted from session token by verifyShopifySession middleware
  const shopDomain = req.shopDomain;
  const shopConfig = req.shop;

  if (!pack) {
    return res.status(400).json({ error: "Missing pack" });
  }
  if (!TOKEN_PRICE_IDS[pack]) return res.status(400).json({ error: "Invalid token pack" });

  // Fetch shop email if not provided
  let shopEmail = email;
  if (!shopEmail) {
    try {
      const shopDetails = await axios.get(
        `https://${shopDomain}/admin/api/2023-10/shop.json`,
        {
          headers: { "X-Shopify-Access-Token": shopConfig.shopifyAccessToken }
        }
      );
      shopEmail = shopDetails.data.shop.email;
    } catch (err) {
      console.error("Failed to fetch shop email:", err.message);
      return res.status(400).json({ error: "Could not fetch shop email" });
    }
  }

  console.log("Creating Shopify checkout for:", shopEmail, "pack:", pack, "shop:", shopDomain);

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{ price: TOKEN_PRICE_IDS[pack], quantity: 1 }],
      mode: "payment",
      customer_email: shopEmail,
      success_url: `https://pdfify.pro/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://${shopDomain}/admin/apps/pdfify-invoice-generator`,
      metadata: {
        shopDomain,
        priceId: TOKEN_PRICE_IDS[pack],
      },
    });

    console.log("Stripe session created:", session.url);
    res.json({ url: session.url });
  } catch (err) {
    console.error("❌ Error creating Shopify token checkout:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- Shopify-specific subscription checkout (REMOVED - Using Shopify Billing API) ---
// DEPRECATED: Subscriptions now handled through Shopify Billing API
// Use /api/shopify/billing/subscribe instead


// --- Unsubscribe endpoint ---
router.post("/unsubscribe", authenticate, dualAuth, async (req, res) => {
  const userId = req.user.userId;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.stripeSubscriptionId) {
      await stripe.subscriptions.del(user.stripeSubscriptionId);
      user.stripeSubscriptionId = undefined;
    }

    user.isPremium = false;
    user.planType = "free";
    user.maxUsage = 30;
    await user.save();

    log("Subscription canceled for user:", user.email);
    res.json({ message: "Subscription downgraded to free!" });
  } catch (error) {
    console.error("Error canceling subscription:", error);
    res.status(500).json({ error: "Error canceling subscription" });
  }
});

module.exports = router;
