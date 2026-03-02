const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const ShopConfig = require("../../models/ShopConfig");
const User = require("../../models/User");

const router = express.Router();

require('dotenv').config();

/**
 * Generate Shopify billing URL for subscription
 * POST /api/shopify/billing/subscribe
 */
router.post("/subscribe", async (req, res) => {
  try {
    const { shopDomain, plan } = req.body;

    if (!shopDomain || !plan) {
      return res.status(400).json({ error: "Missing shopDomain or plan" });
    }

    const normalizedShop = shopDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');

    // Verify shop is installed
    const shopConfig = await ShopConfig.findOne({ shopDomain: normalizedShop });
    if (!shopConfig || !shopConfig.shopifyAccessToken) {
      return res.status(404).json({ error: "Shop not installed. Please install the app first." });
    }

    // Plan pricing and names (must match Shopify Partners dashboard)
    const plans = {
      premium: {
        name: "Premium Plan",
        price: 4.99,
        currency: "EUR",
        trialDays: 7,
        planType: "premium"
      },
      pro: {
        name: "Pro Plan",
        price: 49.99,
        currency: "EUR",
        trialDays: 7,
        planType: "pro"
      }
    };

    const selectedPlan = plans[plan];
    if (!selectedPlan) {
      return res.status(400).json({ error: "Invalid plan" });
    }

    // Shopify Billing API mutation
    const mutation = `
      mutation appSubscriptionCreate($name: String!, $trialDays: Int, $plan: AppSubscriptionPlanInput!) {
        appSubscriptionCreate(
          name: $name
          trialDays: $trialDays
          plan: $plan
          test: ${process.env.NODE_ENV !== 'production'}
        ) {
          appSubscription {
            id
            status
            trialDays
          }
          confirmationUrl
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      name: selectedPlan.name,
      trialDays: selectedPlan.trialDays,
      plan: {
        appRecurringPricingDetails: {
          price: {
            amount: selectedPlan.price,
            currencyCode: selectedPlan.currency
          },
          interval: EVERY_30_DAYS
        }
      }
    };

    // Call Shopify GraphQL Admin API
    const response = await axios.post(
      `https://${normalizedShop}/admin/api/2024-01/graphql.json`,
      { query: mutation, variables },
      {
        headers: {
          "X-Shopify-Access-Token": shopConfig.shopifyAccessToken,
          "Content-Type": "application/json"
        }
      }
    );

    const data = response.data.data.appSubscriptionCreate;

    if (data.userErrors && data.userErrors.length > 0) {
      console.error("Shopify billing errors:", data.userErrors);
      return res.status(400).json({
        error: "Failed to create subscription",
        details: data.userErrors[0].message
      });
    }

    // Store pending subscription in shop config
    shopConfig.pendingPlan = selectedPlan.planType;
    shopConfig.pendingSubscriptionId = data.appSubscription.id;
    await shopConfig.save();

    console.log(`✅ Shopify billing checkout created for ${normalizedShop}: ${selectedPlan.name}`);

    res.json({
      confirmationUrl: data.confirmationUrl,
      subscriptionId: data.appSubscription.id
    });

  } catch (error) {
    console.error("❌ Shopify billing error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to create billing subscription",
      details: error.message
    });
  }
});

/**
 * Handle Shopify billing webhook - subscription created
 * POST /api/shopify/billing/webhook
 */
router.post("/webhook", async (req, res) => {
  const shop = req.headers["x-shopify-shop-domain"];
  const topic = req.headers["x-shopify-topic"];

  console.log(`📢 Shopify billing webhook: ${topic} for shop: ${shop}`);

  try {
    const normalizedShop = shop.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');

    if (topic === "app_subscriptions/update") {
      const subscription = req.body;

      // Determine plan type from subscription amount
      const amount = subscription.app_recurring_pricing_details.price.amount;
      let planType = "free";

      if (amount >= 49.99) {
        planType = "pro";
      } else if (amount >= 4.99) {
        planType = "premium";
      }

      // Find or create user for this shop
      let user = await User.findOne({ connectedShopDomain: normalizedShop });

      if (!user) {
        // Create user for this shop
        const shopConfig = await ShopConfig.findOne({ shopDomain: normalizedShop });
        user = new User({
          email: shopConfig?.shopEmail || `shop@${normalizedShop}`,
          apiKey: crypto.randomBytes(24).toString("hex"),
          password: crypto.randomBytes(24).toString("hex"),
          connectedShopDomain: normalizedShop,
          planType,
          isPremium: planType !== "free",
          maxUsage: planType === "pro" ? 10000 : (planType === "premium" ? 1000 : 30)
        });
        await user.save();
        console.log(`✅ Created new user for shop ${normalizedShop} with plan ${planType}`);
      } else {
        // Update existing user
        user.planType = planType;
        user.isPremium = planType !== "free";
        user.maxUsage = planType === "pro" ? 10000 : (planType === "premium" ? 1000 : 30);
        await user.save();
        console.log(`✅ Updated shop ${normalizedShop} to plan ${planType}`);
      }

      // Clear pending subscription from shop config
      await ShopConfig.findOneAndUpdate(
        { shopDomain: normalizedShop },
        { $unset: { pendingPlan: "", pendingSubscriptionId: "" } }
      );
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Billing webhook error:", error);
    res.status(500).send("Error processing webhook");
  }
});

/**
 * Get current subscription status
 * GET /api/shopify/billing/status?shopDomain=xxx
 */
router.get("/status", async (req, res) => {
  try {
    const { shopDomain } = req.query;

    if (!shopDomain) {
      return res.status(400).json({ error: "Missing shopDomain" });
    }

    const normalizedShop = shopDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');

    // Get user to check plan
    const user = await User.findOne({ connectedShopDomain: normalizedShop });

    const planType = user?.planType || user?.plan || "free";
    const planLimits = { free: 30, premium: 1000, pro: 10000 };
    const limit = planLimits[planType] || 30;

    res.json({
      plan: planType,
      limit,
      hasSubscription: planType !== "free"
    });

  } catch (error) {
    console.error("❌ Status check error:", error);
    res.status(500).json({ error: "Failed to check subscription status" });
  }
});

module.exports = router;
