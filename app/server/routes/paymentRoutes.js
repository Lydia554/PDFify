const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const router = express.Router();
const authenticate = require("../middleware/authenticate");
const dualAuth = require("../middleware/dualAuth");
const User = require("../models/User");

const log = (msg, data = null) => {
  if (process.env.NODE_ENV !== "production") console.log(msg, data);
};

const PRICE_IDS = {
  premium: "price_1RbKxxJqMBxMksyPbeeE33I9",
  pro: "price_1RbKYnJqMBxMksyPjOLtaiBt",
};

// Token pack prices
const TOKEN_PRICE_IDS = {
  "1000": "price_token_1000",
  "5000": "price_token_5000",
  "10000": "price_token_10000"
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

// --- Create token pack checkout session ---
router.post("/buy-tokens", authenticate, async (req, res) => {
  const { pack } = req.body; // "1000", "5000", "10000"
  const user = await User.findById(req.user.userId);

  if (!user) return res.status(404).json({ error: "User not found" });
  if (!TOKEN_PRICE_IDS[pack]) return res.status(400).json({ error: "Invalid token pack" });

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
        priceId: TOKEN_PRICE_IDS[pack] 
      }
    });

    log(`Token pack ${pack} checkout session created for user: ${user.email}`);
    res.json({ id: session.id });
  } catch (err) {
    console.error("❌ Error creating token checkout:", err);
    res.status(500).json({ error: "Failed to create token checkout" });
  }
});

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
