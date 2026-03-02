const axios = require('axios');

// Your shop domain and access token
const shopDomain = 'mystore-123456789789457987.myshopify.com';
const accessToken = 'shpat_9182665e2...'; // Your access token from logs

async function getWebhookSecret() {
  try {
    const response = await axios.get(
      `https://${shopDomain}/admin/api/2024-01/webhooks.json`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken
        }
      }
    );

    const webhooks = response.data.webhooks;
    console.log('Found', webhooks.length, 'webhooks:\n');

    webhooks.forEach(webhook => {
      console.log('Topic:', webhook.topic);
      console.log('Address:', webhook.address);
      console.log('Format:', webhook.format);
      console.log('ID:', webhook.id);
      console.log('Created at:', webhook.created_at);
      console.log('---');
    });

    // Note: Shopify does NOT return the webhook secret via API for security reasons
    console.log('\n⚠️  Shopify does NOT expose webhook secrets via API for security.');
    console.log('The secret is only available when the webhook is first created.');

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

getWebhookSecret();
