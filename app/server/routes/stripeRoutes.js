const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const bodyParser = require("body-parser");
const sendEmail = require("../sendEmail");
const User = require("../models/User");
const router = express.Router();

const log = (message, data = null) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(message, data);
  }
};

router.post(
  "/webhook",
  bodyParser.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

   if (event.type === "checkout.session.completed") {
  const session = event.data.object;
  log("Checkout session completed:", session);

  try {
    const customerEmail = session.customer_details.email;
    const shopDomain = session.metadata?.shopDomain;
    const priceId = session.metadata?.priceId || null;

    // --- Token pack mapping ---
    const tokenMapping = {
      price_token_1000: 1000,
      price_token_5000: 5000,
      price_token_10000: 10000
    };

    // Handle token packs first
    if (priceId && tokenMapping[priceId]) {
      let user;

      // For Shopify purchases, find or create user by shopDomain
      if (shopDomain) {
        user = await User.findOne({ connectedShopDomain: shopDomain });

        if (!user) {
          // Create new user for this shop
          const apiKey = require("crypto").randomBytes(24).toString("hex");
          user = new User({
            email: customerEmail,
            apiKey,
            password: require("crypto").randomBytes(24).toString("hex"),
            connectedShopDomain: shopDomain,
            extraPages: tokenMapping[priceId],
          });
          await user.save();
          log(`🪙 Created new user for shop ${shopDomain} with ${tokenMapping[priceId]} extra pages`);
        } else {
          user.extraPages = (user.extraPages || 0) + tokenMapping[priceId];
          await user.save();
          log(`🪙 Added ${tokenMapping[priceId]} extra pages for shop ${shopDomain}`);
        }
      } else {
        // Regular token purchase - find by email
        user = await User.findOne({ email: customerEmail });
        if (!user) {
          console.warn("User not found for token pack:", customerEmail);
          return;
        }
        user.extraPages = (user.extraPages || 0) + tokenMapping[priceId];
        await user.save();
        log(`🪙 Added ${tokenMapping[priceId]} extra pages for ${customerEmail}`);
      }

      await sendEmail({
        to: customerEmail,
        subject: "Token Pack Purchased",
        text: `Hi,\n\nYou have successfully purchased ${tokenMapping[priceId]} extra pages for your Shopify store!\n\nBest regards,\nThe PDFify Team`,
      });

      return;
    }

    // Handle subscription purchases
    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    const subPriceId = subscription.items.data[0].price.id;
    const price = await stripe.prices.retrieve(subPriceId);
    const planType = price.metadata.plan_type || session.metadata?.planType || "premium";

    let user;

    // For Shopify purchases, find by shopDomain
    if (shopDomain) {
      user = await User.findOne({ connectedShopDomain: shopDomain });

      if (!user) {
        // Create new user for this shop
        const apiKey = require("crypto").randomBytes(24).toString("hex");
        user = new User({
          email: customerEmail,
          apiKey,
          password: require("crypto").randomBytes(24).toString("hex"),
          connectedShopDomain: shopDomain,
          stripeSubscriptionId: session.subscription,
          isPremium: true,
          planType,
          maxUsage: planType === "pro" ? 10000 : 1000,
        });
        await user.save();
        log(`✅ Created new user for shop ${shopDomain} with ${planType} subscription`);
      } else {
        user.stripeSubscriptionId = session.subscription;
        user.isPremium = true;
        user.planType = planType;
        user.maxUsage = planType === "pro" ? 10000 : 1000;
        await user.save();
        log(`✅ Updated shop ${shopDomain} to ${planType} subscription`);
      }
    } else {
      // Regular subscription - find by email
      user = await User.findOne({ email: customerEmail });

      if (!user) {
        console.warn("User not found for email:", customerEmail);
        const apiKey = require("crypto").randomBytes(24).toString("hex");
        user = new User({
          email: customerEmail,
          apiKey,
          password: "temporaryPassword123",
          stripeSubscriptionId: session.subscription,
          isPremium: true,
          maxUsage: planType === "pro" ? 10000 : 1000,
          planType,
        });

        await user.save();
        log("New user created:", user);
      } else {
        user.stripeSubscriptionId = session.subscription;
        user.isPremium = true;
        user.planType = planType;
        user.maxUsage = planType === "pro" ? 10000 : 1000;
        await user.save();
        log("User updated:", user);
      }
    }

    await sendEmail({
      to: customerEmail,
      subject: "Payment Successful - Thank You!",
      text: `Hi,\n\nThank you for your payment! Your ${planType} subscription is now active for your Shopify store.\n\nBest regards,\nThe PDFify Team`,
    });

  } catch (error) {
    console.error("Error handling checkout completion:", error);
  }
}


    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const customerId = subscription.customer;

      try {
        const customer = await stripe.customers.retrieve(customerId);
        const customerEmail = customer.email;

        // Try to find user by email first (regular users)
        let user = await User.findOne({ email: customerEmail });

        // If not found, try by connectedShopDomain from metadata
        if (!user && subscription.metadata?.shopDomain) {
          user = await User.findOne({ connectedShopDomain: subscription.metadata.shopDomain });
        }

        if (!user) {
          console.warn("User not found for cancelled subscription:", customerEmail);
          return res.json({ received: true });
        }

        user.isPremium = false;
        user.planType = "free";
        user.maxUsage = 30;
        user.stripeSubscriptionId = null;

        await user.save();
        log("User downgraded to free plan:", user);

        await sendEmail({
          to: customerEmail,
          subject: "Subscription Cancelled",
          text: `Hi,\n\nYour PDFify subscription has been cancelled. You're now on the free plan.\n\nBest regards,\nThe PDFify Team`,
        });
      } catch (error) {
        console.error("Error handling subscription cancellation:", error);
      }
    }

    res.json({ received: true });
  }
);

module.exports = router;
