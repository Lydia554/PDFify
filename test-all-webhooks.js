require('dotenv').config();
const crypto = require('crypto');
const axios = require('axios');

// Configuration
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_CLIENT_SECRET;
const BASE_URL = 'https://pdfify.pro/webhook';
const SHOP_DOMAIN = 'test-store.myshopify.com';

// All 5 webhook endpoints to test
const webhooks = [
  { topic: 'app/uninstalled', path: '/app-uninstalled', payload: { id: 123456789, shop_domain: SHOP_DOMAIN } },
  { topic: 'orders/create', path: '/order-created', payload: { order: { id: 999999, name: '#1001', email: 'test@example.com' }, shop_domain: SHOP_DOMAIN } },
  { topic: 'customers/data_request', path: '/customers-data-request', payload: { shop_domain: SHOP_DOMAIN, customer: { id: 111, email: 'customer@example.com' } } },
  { topic: 'customers/redact', path: '/customers-redact', payload: { shop_domain: SHOP_DOMAIN, customer: { id: 111, email: 'customer@example.com' } } },
  { topic: 'shop/redact', path: '/shop-redact', payload: { shop_domain: SHOP_DOMAIN } }
];

async function testSingleWebhook(webhook) {
  const url = BASE_URL + webhook.path;
  const body = JSON.stringify(webhook.payload);

  // Generate HMAC signature
  const hmac = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(body, 'utf8')
    .digest('base64');

  try {
    const response = await axios.post(url, body, {
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Topic': webhook.topic,
        'X-Shopify-Shop-Domain': SHOP_DOMAIN,
        'X-Shopify-Api-Version': '2026-01',
        'X-Shopify-Hmac-Sha256': hmac
      },
      validateStatus: false // Don't throw on error status
    });

    return {
      topic: webhook.topic,
      path: webhook.path,
      status: response.status,
      success: response.status === 200,
      message: response.status === 200 ? '✅ PASS' : `❌ FAIL (${response.status})`
    };
  } catch (error) {
    return {
      topic: webhook.topic,
      path: webhook.path,
      status: 'ERROR',
      success: false,
      message: `❌ FAIL - ${error.message}`
    };
  }
}

async function testAllWebhooks() {
  console.log('🧪 Testing All Shopify Webhooks\n');
  console.log('=' .repeat(70));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Shop Domain: ${SHOP_DOMAIN}`);
  console.log(`Using SHOPIFY_API_SECRET: ${SHOPIFY_API_SECRET.substring(0, 15)}...`);
  console.log('=' .repeat(70));
  console.log();

  const results = [];

  for (const webhook of webhooks) {
    process.stdout.write(`Testing ${webhook.topic}... `);
    const result = await testSingleWebhook(webhook);
    results.push(result);
    console.log(result.message);
  }

  console.log();
  console.log('=' .repeat(70));
  console.log('SUMMARY');
  console.log('=' .repeat(70));

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`✅ Passed: ${passed}/${results.length}`);
  console.log(`❌ Failed: ${failed}/${results.length}`);
  console.log();

  if (failed === 0) {
    console.log('🎉 ALL WEBHOOKS PASSED!');
    console.log('✅ Your webhooks are ready for Shopify App Store review');
    console.log();
    console.log('Next steps:');
    console.log('1. Submit your app to Shopify App Store');
    console.log('2. The automated checker should now pass both tests:');
    console.log('   ✓ Provides mandatory compliance webhooks');
    console.log('   ✓ Verifies webhooks with HMAC signatures');
  } else {
    console.log('⚠️  SOME WEBHOOKS FAILED');
    console.log();
    console.log('Failed webhooks:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  ❌ ${r.topic} - Status: ${r.status}`);
    });
    console.log();
    console.log('Troubleshooting:');
    console.log('1. Check that SHOPIFY_API_SECRET is set in production');
    console.log('2. Check server logs: docker-compose logs -f app');
    console.log('3. Verify webhook URLs in shopify.app.toml');
    console.log('4. Make sure all endpoints return 200 OK with valid HMAC');
  }

  console.log();
  console.log('=' .repeat(70));
}

// Run tests
testAllWebhooks().catch(console.error);
