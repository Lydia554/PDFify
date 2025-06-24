const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const router = express.Router();
const authenticate = require("../middleware/authenticate");
const dualAuth = require("../middleware/dualAuth");
const User = require("../models/User");

const log = (message, data = null) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(message, data);
  }
};


const PRICE_IDS = {
  premium: 'price_1RbKxxJqMBxMksyPbeeE33I9', 
  pro: 'price_1RbKYnJqMBxMksyPjOLtaiBt',    
};

router.post("/create-checkout-session", async (req, res) => {
  const { email, plan } = req.body;

  if (!email || !plan || !PRICE_IDS[plan]) {
    return res.status(400).json({ error: "Invalid plan or email provided" });
  }

  try {
   log("Received request to create checkout session:", { email, plan });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [
        {
          price: PRICE_IDS[plan],
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CANCEL_URL}`,
    });

    log("Stripe checkout session created successfully:", session);
    res.json({ id: session.id });
  } catch (err) {
    console.error("Error creating Stripe checkout session:", err);
    res.status(500).json({ error: err.message });
  }
});

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

    log("Subscription canceled for user:", user);
    res.json({ message: "Subscription downgraded to free!" });
  } catch (error) {
    console.error("Error canceling subscription:", error);
    res.status(500).json({ error: "Error canceling subscription" });
  }
});

module.exports = router;
