const crypto = require('crypto');
const axios = require('axios');

// Configuration
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_CLIENT_SECRET;
const WEBHOOK_URL = 'https://pdfify.pro/webhook/app-uninstalled';
const SHOP_DOMAIN = 'test-store.myshopify.com';

// Test payload (simulates Shopify webhook)
const payload = {
  id: 123456789,
  name: 'Test App',
  shop_domain: SHOP_DOMAIN,
  created_at: new Date().toISOString()
};

function testWebhook() {
  console.log('🧪 Testing webhook endpoint...\n');
  console.log('URL:', WEBHOOK_URL);
  console.log('Shop Domain:', SHOP_DOMAIN);
  console.log('Payload:', JSON.stringify(payload, null, 2));
  console.log('\n---\n');

  // Convert payload to JSON string
  const body = JSON.stringify(payload);

  // Generate HMAC signature (exactly how Shopify does it)
  const hmac = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(body, 'utf8')  // Use UTF-8 encoding for string
    .digest('base64');

  console.log('🔐 Generated HMAC:', hmac.substring(0, 30) + '...');

  // Send request with Shopify headers
  axios.post(WEBHOOK_URL, body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Topic': 'app/uninstalled',
      'X-Shopify-Shop-Domain': SHOP_DOMAIN,
      'X-Shopify-Api-Version': '2026-01',
      'X-Shopify-Hmac-Sha256': hmac,
      'User-Agent': 'Shopify Automated Checker Test'
    }
  })
  .then(response => {
    console.log('\n✅ SUCCESS!');
    console.log('Status:', response.status);
    console.log('Status Text:', response.statusText);
    console.log('Response:', response.data);
    console.log('\n✅ Webhook is working correctly!');
    console.log('   - Endpoint is accessible');
    console.log('   - HMAC verification passed');
    console.log('   - Handler returned 200 OK');
  })
  .catch(error => {
    console.log('\n❌ ERROR!');
    if (error.response) {
      // Server responded with error status
      console.log('Status:', error.response.status);
      console.log('Status Text:', error.response.statusText);
      console.log('Response:', error.response.data);

      if (error.response.status === 401) {
        console.log('\n⚠️  Got 401 Unauthorized');
        console.log('   This means HMAC verification FAILED.');
        console.log('   Possible causes:');
        console.log('   1. SHOPIFY_API_SECRET not set in production');
        console.log('   2. Wrong SHOPIFY_API_SECRET value');
        console.log('   3. HMAC calculation bug in code');
      } else if (error.response.status === 500) {
        console.log('\n⚠️  Got 500 Internal Server Error');
        console.log('   Check server logs for crash details');
      }
    } else if (error.request) {
      // Request sent but no response
      console.log('No response received:', error.message);
      console.log('Possible causes:');
      console.log('1. Server is down');
      console.log('2. Wrong URL');
      console.log('3. Firewall/network issue');
    } else {
      // Other error
      console.log('Error:', error.message);
    }
  });
}

// Run test
testWebhook();
