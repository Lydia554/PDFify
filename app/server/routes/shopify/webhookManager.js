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

// NOTE: Some GDPR webhook topics may not register in newer API versions
// The handlers exist and work correctly - Shopify's automated checker
// tests endpoints directly regardless of registration status

/**
 * Get all existing webhooks for a shop (both REST and GraphQL)
 */
async function getExistingWebhooks(shopDomain, accessToken) {
  let allWebhooks = [];

  // Fetch REST webhooks
  try {
    const response = await axios.get(
      `https://${shopDomain}/admin/api/2024-01/webhooks.json`,
      {
        headers: { "X-Shopify-Access-Token": accessToken }
      }
    );
    allWebhooks = response.data.webhooks || [];
  } catch (error) {
    console.error("❌ Failed to fetch REST webhooks:", error.message);
  }

  // Fetch GraphQL webhook subscriptions (for GDPR webhooks)
  try {
    const query = `
      query {
        webhookSubscriptions(first: 50) {
          edges {
            node {
              id
              topic
              endpoint {
                url
              }
            }
          }
        }
      }
    `;

    const response = await axios.post(
      `https://${shopDomain}/admin/api/2024-01/graphql.json`,
      { query },
      {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json"
        }
      }
    );

    const graphqlWebhooks = response.data.data?.webhookSubscriptions?.edges || [];

    // Convert GraphQL webhooks to REST format for consistency
    graphqlWebhooks.forEach(({ node }) => {
      // Convert GraphQL topic back to REST format
      const topic = node.topic.toLowerCase().replace(/_/g, '/');
      // CUSTOMERS_REDACT -> customers/redact

      allWebhooks.push({
        id: node.id,
        topic: topic,
        address: node.endpoint.url,
        format: 'json'
      });
    });
  } catch (error) {
    console.log("ℹ️ No GraphQL webhook subscriptions found");
  }

  console.log(`   Found ${allWebhooks.length} total webhooks (REST + GraphQL)`);
  return allWebhooks;
}

/**
 * Delete a webhook (try both REST and GraphQL)
 */
async function deleteWebhook(shopDomain, accessToken, webhookId) {
  // Try REST delete first
  try {
    await axios.delete(
      `https://${shopDomain}/admin/api/2024-01/webhooks/${webhookId}.json`,
      {
        headers: { "X-Shopify-Access-Token": accessToken }
      }
    );
    console.log(`🗑️ Deleted webhook (REST) ${webhookId}`);
    return true;
  } catch (restError) {
    // Try GraphQL delete (for webhook subscriptions)
    try {
      const mutation = `
        mutation webhookSubscriptionDelete($id: ID!) {
          webhookSubscriptionDelete(id: $id) {
            deletedWebhookSubscriptionId
            userErrors {
              field
              message
            }
          }
        }
      `;

      const response = await axios.post(
        `https://${shopDomain}/admin/api/2024-01/graphql.json`,
        {
          query: mutation,
          variables: { id: webhookId }
        },
        {
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json"
          }
        }
      );

      const result = response.data.data?.webhookSubscriptionDelete;

      if (result?.deletedWebhookSubscriptionId) {
        console.log(`🗑️ Deleted webhook (GraphQL) ${webhookId}`);
        return true;
      }

      if (result?.userErrors?.length > 0) {
        console.error(`❌ Failed to delete GraphQL webhook:`, result.userErrors[0].message);
      }
    } catch (graphQLError) {
      console.error(`❌ Failed to delete webhook ${webhookId}:`, restError.message, graphQLError.message);
    }
    return false;
  }
}

/**
 * Register a new webhook (try both REST and GraphQL)
 */
async function registerWebhook(shopDomain, accessToken, webhook) {
  // For GDPR webhooks, try GraphQL first (they use different topic names)
  if (webhook.topic.includes('redact') || webhook.topic.includes('data_request')) {
    try {
      // Convert REST topic to GraphQL topic format
      const graphqlTopic = webhook.topic.toUpperCase().replace(/\//g, '_');
      // customers/redact -> CUSTOMERS_REDACT
      // customers/data_request -> CUSTOMERS_DATA_REQUEST
      // shop/redact -> SHOP_REDACT

      const mutation = `
        mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
          webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
            webhookSubscription {
              id
              topic
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const response = await axios.post(
        `https://${shopDomain}/admin/api/2024-01/graphql.json`,
        {
          query: mutation,
          variables: {
            topic: graphqlTopic,
            webhookSubscription: {
              httpMethod: "POST",
              endpoint: {
                url: webhook.address
              },
              format: "JSON"
            }
          }
        },
        {
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json"
          }
        }
      );

      const result = response.data.data?.webhookSubscriptionCreate;

      if (result && result.webhookSubscription) {
        console.log(`✅ Registered webhook (GraphQL): ${webhook.topic}`);
        return result.webhookSubscription;
      }

      if (result?.userErrors?.length > 0) {
        console.log(`   GraphQL error: ${result.userErrors[0].message}`);
      }
    } catch (graphqlError) {
      console.log(`   GraphQL failed, trying REST...`);
    }
  }

  // Try REST API (for non-GDPR webhooks or fallback)
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

    console.log(`✅ Registered webhook (REST): ${webhook.topic}`);
    return response.data.webhook;
  } catch (error) {
    // If webhook topic doesn't exist, log but don't fail
    if (error.response?.data?.errors?.includes('Could not find the webhook topic')) {
      console.log(`⚠️ Webhook topic '${webhook.topic}' not available in this API version`);
      console.log(`   Handler exists at ${webhook.address} but cannot be registered`);
      return { topic: webhook.topic, address: webhook.address, deprecated: true };
    }
    console.error(`❌ Failed to register webhook ${webhook.topic}:`, error.response?.data || error.message);
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
