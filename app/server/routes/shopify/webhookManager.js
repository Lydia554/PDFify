const axios = require("axios");

/**
 * Webhook management for Shopify app
 * Handles registration and cleanup of webhooks
 */

// All required webhooks for the app
const REQUIRED_WEBHOOKS = [
  {
    topic: "app/uninstalled",
    address: "https://pdfify.pro/webhook/app-uninstalled",
    format: "json"
  },
  {
    topic: "orders/create",
    address: "https://pdfify.pro/webhook/order-created",
    format: "json"
  },
  {
    topic: "customers/redact",
    address: "https://pdfify.pro/webhook/customers-redact",
    format: "json"
  },
  {
    topic: "customers/data_request",
    address: "https://pdfify.pro/webhook/customers-data-request",
    format: "json"
  },
  {
    topic: "shop/redact",
    address: "https://pdfify.pro/webhook/shop-redact",
    format: "json"
  }
];

// Alternative GDPR topic names (for older API versions)
const FALLBACK_GDPR_WEBHOOKS = [
  {
    topic: "customers/redact",
    address: "https://pdfify.pro/webhook/customers-redact",
    format: "json"
  },
  {
    topic: "customers/data_request",
    address: "https://pdfify.pro/webhook/customers-data-request",
    format: "json"
  },
  {
    topic: "shop/redact",
    address: "https://pdfify.pro/webhook/shop-redact",
    format: "json"
  }
];

/**
 * Get all existing webhooks for a shop
 */
async function getExistingWebhooks(shopDomain, accessToken) {
  let allWebhooks = [];

  try {
    // Try 2024-01 first
    const response = await axios.get(
      `https://${shopDomain}/admin/api/2024-01/webhooks.json`,
      {
        headers: { "X-Shopify-Access-Token": accessToken }
      }
    );
    allWebhooks = response.data.webhooks || [];
  } catch (error) {
    console.error("❌ Failed to fetch webhooks from 2024-01 API:", error.message);
  }

  // Also check 2023-10 for older webhooks
  try {
    const response = await axios.get(
      `https://${shopDomain}/admin/api/2023-10/webhooks.json`,
      {
        headers: { "X-Shopify-Access-Token": accessToken }
      }
    );
    const oldWebhooks = response.data.webhooks || [];

    // Merge without duplicates (by ID)
    const existingIds = new Set(allWebhooks.map(w => w.id));
    oldWebhooks.forEach(w => {
      if (!existingIds.has(w.id)) {
        allWebhooks.push(w);
      }
    });
  } catch (error) {
    console.log("ℹ️ No webhooks found in 2023-10 API (normal if all are 2024-01)");
  }

  return allWebhooks;
}

/**
 * Delete a webhook
 */
async function deleteWebhook(shopDomain, accessToken, webhookId) {
  try {
    await axios.delete(
      `https://${shopDomain}/admin/api/2024-01/webhooks/${webhookId}.json`,
      {
        headers: { "X-Shopify-Access-Token": accessToken }
      }
    );
    console.log(`🗑️ Deleted webhook ${webhookId}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to delete webhook ${webhookId}:`, error.message);
    return false;
  }
}

/**
 * Register a new webhook
 */
async function registerWebhook(shopDomain, accessToken, webhook) {
  try {
    const response = await axios.post(
      `https://${shopDomain}/admin/api/2024-01/webhooks.json`,
      {
        webhook: {
          topic: webhook.topic,
          address: webhook.address,
          format: webhook.format
        }
      },
      {
        headers: { "X-Shopify-Access-Token": accessToken }
      }
    );

    console.log(`✅ Registered webhook: ${webhook.topic}`);
    return response.data.webhook;
  } catch (error) {
    console.error(`❌ Failed to register webhook ${webhook.topic}:`, error.response?.data || error.message);

    // If GDPR webhook fails, try older API version
    if (webhook.topic.includes('redact') || webhook.topic.includes('data_request')) {
      console.log(`   Retrying with 2023-10 API version for ${webhook.topic}...`);
      try {
        const response = await axios.post(
          `https://${shopDomain}/admin/api/2023-10/webhooks.json`,
          {
            webhook: {
              topic: webhook.topic,
              address: webhook.address,
              format: webhook.format
            }
          },
          {
            headers: { "X-Shopify-Access-Token": accessToken }
          }
        );
        console.log(`✅ Registered webhook (2023-10): ${webhook.topic}`);
        return response.data.webhook;
      } catch (retryError) {
        console.error(`   Still failed with 2023-10:`, retryError.response?.data || retryError.message);
      }
    }

    return null;
  }
}

/**
 * Sync webhooks - register missing ones, clean up duplicates
 * This should be called during app installation
 */
async function syncWebhooks(shopDomain, accessToken) {
  console.log(`🔄 [Webhook Sync] Starting webhook sync for ${shopDomain}...`);

  // Get existing webhooks
  const existingWebhooks = await getExistingWebhooks(shopDomain, accessToken);
  console.log(`   Found ${existingWebhooks.length} existing webhooks`);

  // Group existing webhooks by topic
  const webhooksByTopic = {};
  existingWebhooks.forEach(webhook => {
    if (!webhooksByTopic[webhook.topic]) {
      webhooksByTopic[webhook.topic] = [];
    }
    webhooksByTopic[webhook.topic].push(webhook);
  });

  // Process each required webhook
  for (const required of REQUIRED_WEBHOOKS) {
    const existing = webhooksByTopic[required.topic] || [];

    if (existing.length === 0) {
      // Register missing webhook
      console.log(`   ${required.topic}: REGISTERING (missing)`);
      await registerWebhook(shopDomain, accessToken, required);
    } else if (existing.length === 1) {
      // Check if address matches
      if (existing[0].address === required.address) {
        console.log(`   ${required.topic}: OK (already registered)`);
      } else {
        // Address changed, delete and recreate
        console.log(`   ${required.topic}: UPDATING (address changed)`);
        await deleteWebhook(shopDomain, accessToken, existing[0].id);
        await registerWebhook(shopDomain, accessToken, required);
      }
    } else {
      // Duplicates found - delete all and recreate
      console.log(`   ${required.topic}: CLEANING UP ${existing.length} duplicates`);
      for (const webhook of existing) {
        await deleteWebhook(shopDomain, accessToken, webhook.id);
      }
      await registerWebhook(shopDomain, accessToken, required);
    }
  }

  console.log(`✅ [Webhook Sync] Completed webhook sync for ${shopDomain}`);
}

/**
 * Clean up ALL webhooks for a shop (useful for testing)
 */
async function removeAllWebhooks(shopDomain, accessToken) {
  console.log(`🗑️ [Webhook Cleanup] Removing ALL webhooks for ${shopDomain}...`);

  const existingWebhooks = await getExistingWebhooks(shopDomain, accessToken);

  for (const webhook of existingWebhooks) {
    await deleteWebhook(shopDomain, accessToken, webhook.id);
  }

  console.log(`✅ [Webhook Cleanup] Removed ${existingWebhooks.length} webhooks`);
  return existingWebhooks.length;
}

module.exports = {
  syncWebhooks,
  removeAllWebhooks,
  getExistingWebhooks,
  REQUIRED_WEBHOOKS
};
