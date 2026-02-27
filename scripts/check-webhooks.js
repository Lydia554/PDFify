const axios = require('axios');

// Shopify Admin API endpoint
const SHOPIFY_SHOP = 'your-shop.myshopify.com'; // Replace with actual shop or use app installation
const ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || 'YOUR_ACCESS_TOKEN';

async function checkWebhooks() {
  const query = `
    {
      webhookSubscriptions(first: 50) {
        edges {
          node {
            id
            topic
            endpoint {
              url
              __typename
            }
            format
            status
          }
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      `https://${SHOPIFY_SHOP}/admin/api/2026-01/graphql.json`,
      { query },
      {
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
      }
    );

    const webhooks = response.data.data.webhookSubscriptions.edges;
    console.log('Current registered webhooks:');
    webhooks.forEach(({ node }) => {
      console.log(`- ${node.topic} -> ${node.endpoint.url} (${node.status})`);
    });

    return webhooks;
  } catch (error) {
    console.error('Error fetching webhooks:', error.response?.data || error.message);
  }
}

async function deleteWebhook(webhookId) {
  const mutation = `
    mutation webhookDelete($id: ID!) {
      webhookDelete(id: $id) {
        deletedWebhookId
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      `https://${SHOPIFY_SHOP}/admin/api/2026-01/graphql.json`,
      {
        query: mutation,
        variables: { id: webhookId },
      },
      {
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`Deleted webhook: ${webhookId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting webhook:', error.response?.data || error.message);
  }
}

// Run the check
checkWebhooks().then((webhooks) => {
  console.log(`\nFound ${webhooks.length} webhooks`);
  console.log('\nTo delete webhooks, use: deleteWebhook("WEBHOOK_ID")');
});
