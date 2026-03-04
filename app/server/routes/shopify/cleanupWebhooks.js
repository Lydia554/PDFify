const express = require("express");
const router = express.Router();
const ShopConfig = require("../../models/ShopConfig");
const User = require("../../models/User");
const axios = require("axios");

/**
 * DEBUG ENDPOINT: List all users with their shopify-related fields
 *
 * Usage: GET /api/shopify/util/debug-users
 */
router.get("/debug-users", async (req, res) => {
  try {
    // Find all users that have Shopify connection data
    const users = await User.find({
      $or: [
        { connectedShopDomain: { $exists: true } },
        { shopifyAccessToken: { $exists: true } }
      ]
    }).select('email connectedShopDomain shopifyAccessToken planType isPremium');

    res.json({
      success: true,
      count: users.length,
      users: users.map(u => ({
        email: u.email,
        connectedShopDomain: u.connectedShopDomain,
        hasAccessToken: !!u.shopifyAccessToken,
        accessTokenPreview: u.shopifyAccessToken ? u.shopifyAccessToken.substring(0, 15) + '...' : 'N/A',
        planType: u.planType || 'N/A',
        isPremium: u.isPremium || false
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * UTILITY ENDPOINT: List all shops in database
 *
 * Usage: GET /api/shopify/util/list-shops
 */
router.get("/list-shops", async (req, res) => {
  try {
    // Get all shops from ShopConfig
    const shopConfigs = await ShopConfig.find({});

    // For each shop, check if they have access token in User model
    const shops = await Promise.all(shopConfigs.map(async (shop) => {
      const user = await User.findOne({ connectedShopDomain: shop.shopDomain });
      return {
        shopDomain: shop.shopDomain,
        companyName: shop.companyName,
        hasAccessToken: !!(user && user.shopifyAccessToken)
      };
    }));

    res.json({
      success: true,
      count: shops.length,
      shops
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * UTILITY ENDPOINT: Clean up and re-register Shopify webhooks
 *
 * This endpoint will:
 * 1. Get all existing webhooks from Shopify
 * 2. Delete them all
 * 3. Log success so you can re-register via TOML
 *
 * Usage: POST /api/shopify/util/cleanup-webhooks
 * Body: { "shopDomain": "mystore-123456789.myshopify.com" }
 * OR no body to clean up ALL shops
 */
router.post("/cleanup-webhooks", async (req, res) => {
  try {
    const { shopDomain } = req.body;

    // If no shopDomain provided, find all shops
    let targetShop;
    let shopDomainList = [];

    if (!shopDomain) {
      console.log(`\n🧹 [CLEANUP] No shop specified, cleaning up ALL shops`);
      const allShops = await ShopConfig.find({ shopifyAccessToken: { $exists: true, $ne: null } });
      shopDomainList = allShops.map(s => s.shopDomain);
      console.log(`📋 [CLEANUP] Found ${shopDomainList.length} shop(s) to clean up`);

      // TODO: Implement cleanup for all shops
      return res.json({
        success: false,
        error: "Cleanup for all shops not yet implemented. Please specify a shopDomain."
      });
    }

    console.log(`\n🧹 [CLEANUP] Starting webhook cleanup for ${shopDomain}`);

    // Find the user to get access token (stored in User model, not ShopConfig)
    const user = await User.findOne({
      connectedShopDomain: shopDomain.toLowerCase().trim()
    });

    if (!user || !user.shopifyAccessToken) {
      return res.status(404).json({
        success: false,
        error: "Shop not found or no access token available"
      });
    }

    const accessToken = user.shopifyAccessToken;
    console.log(`✅ [CLEANUP] Found access token: ${accessToken.substring(0, 15)}...`);

    // Fetch all existing webhooks
    console.log(`🔍 [CLEANUP] Fetching existing webhooks from Shopify...`);

    const response = await axios.get(
      `https://${shopDomain}/admin/api/2026-01/webhooks.json`,
      {
        headers: {
          "X-Shopify-Access-Token": accessToken
        }
      }
    );

    const webhooks = response.data.webhooks;

    if (webhooks.length === 0) {
      console.log(`✅ [CLEANUP] No existing webhooks found`);
      return res.json({
        success: true,
        message: "No existing webhooks to clean up",
        deleted: 0,
        webhooks: []
      });
    }

    console.log(`📋 [CLEANUP] Found ${webhooks.length} existing webhooks:`);
    webhooks.forEach((w, i) => {
      console.log(`   ${i + 1}. ${w.topic} → ${w.address}`);
    });

    // Delete all webhooks
    console.log(`\n🗑️  [CLEANUP] Deleting all webhooks...\n`);

    const results = [];
    let deleted = 0;
    let failed = 0;

    for (const webhook of webhooks) {
      try {
        await axios.delete(
          `https://${shopDomain}/admin/api/2026-01/webhooks/${webhook.id}.json`,
          {
            headers: {
              "X-Shopify-Access-Token": accessToken
            }
          }
        );
        console.log(`✅ [CLEANUP] Deleted: ${webhook.topic} (${webhook.address})`);
        results.push({
          topic: webhook.topic,
          address: webhook.address,
          status: "deleted"
        });
        deleted++;
      } catch (err) {
        console.log(`❌ [CLEANUP] Failed to delete ${webhook.topic}: ${err.message}`);
        results.push({
          topic: webhook.topic,
          address: webhook.address,
          status: "failed",
          error: err.message
        });
        failed++;
      }
    }

    console.log(`\n✅ [CLEANUP] Cleanup complete!`);
    console.log(`   Deleted: ${deleted}`);
    console.log(`   Failed: ${failed}`);

    res.json({
      success: true,
      message: `Webhook cleanup complete. Deleted ${deleted} webhooks.`,
      deleted,
      failed,
      webhooks: results,
      nextSteps: [
        "1. Reinstall the app on the test store, OR",
        "2. Run: shopify app deploy",
        "3. New webhooks will be registered via shopify.app.toml"
      ]
    });

  } catch (error) {
    console.error(`❌ [CLEANUP] Error:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data
    });
  }
});

/**
 * UTILITY ENDPOINT: List all webhooks (read-only)
 */
router.post("/list-webhooks", async (req, res) => {
  try {
    const { shopDomain } = req.body;

    if (!shopDomain) {
      return res.status(400).json({
        success: false,
        error: "shopDomain is required"
      });
    }

    // Find the user to get access token (stored in User model)
    const user = await User.findOne({
      connectedShopDomain: shopDomain.toLowerCase().trim()
    });

    if (!user || !user.shopifyAccessToken) {
      return res.status(404).json({
        success: false,
        error: "Shop not found or no access token"
      });
    }

    const response = await axios.get(
      `https://${shopDomain}/admin/api/2026-01/webhooks.json`,
      {
        headers: {
          "X-Shopify-Access-Token": user.shopifyAccessToken
        }
      }
    );

    const webhooks = response.data.webhooks;

    res.json({
      success: true,
      shopDomain,
      count: webhooks.length,
      webhooks: webhooks.map(w => ({
        id: w.id,
        topic: w.topic,
        address: w.address,
        format: w.format,
        createdAt: w.created_at,
        updatedAt: w.updated_at
      }))
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data
    });
  }
});

module.exports = router;
