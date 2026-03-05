#!/usr/bin/env node

/**
 * Test script to verify the app is working for Shopify's automated review
 * Usage: node test-app-review.js <shop-domain>
 * Example: node test-app-review.js quickfast-9656.myshopify.com
 */

const https = require('https');

const shop = process.argv[2];

if (!shop) {
  console.error('❌ Please provide a shop domain');
  console.error('Usage: node test-app-review.js <shop-domain>');
  console.error('Example: node test-app-review.js quickfast-9656.myshopify.com');
  process.exit(1);
}

console.log(`🔍 Testing app for: ${shop}`);
console.log('');

// Test 1: Check if app responds
function testEndpoint(path, name) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'pdfify.pro',
      port: 443,
      path: path,
      method: 'GET',
      headers: {
        'X-Shopify-Shop-Domain': shop
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode === 200) {
            console.log(`✅ ${name}: PASS (${res.statusCode})`);
            resolve(json);
          } else {
            console.log(`❌ ${name}: FAIL (${res.statusCode})`);
            console.log(`   Response:`, data);
            resolve(null);
          }
        } catch (err) {
          console.log(`❌ ${name}: FAIL (Invalid JSON)`);
          resolve(null);
        }
      });
    });

    req.on('error', (err) => {
      console.log(`❌ ${name}: FAIL (${err.message})`);
      resolve(null);
    });

    req.end();
  });
}

async function runTests() {
  console.log('Running automated app review checks...\n');

  // Test embedded app HTML loads
  console.log('1. Testing embedded app HTML...');
  const htmlCheck = await testEndpoint('/shopify-embedded.html', 'HTML loads');
  if (!htmlCheck) {
    console.log('\n⚠️ CRITICAL: App HTML is not loading!');
    console.log('This will cause Shopify review to fail.\n');
  }

  // Test if app can handle session tokens
  console.log('\n2. Testing app configuration endpoint...');
  const configCheck = await testEndpoint('/api/shopify/config', 'Config endpoint');

  // Test if shop is registered
  console.log('\n3. Testing shop registration...');
  const connectionCheck = await testEndpoint('/api/shopify/test-connection', 'Connection test');

  console.log('\n' + '='.repeat(50));
  console.log('SUMMARY');
  console.log('='.repeat(50));

  const allPassed = htmlCheck && configCheck && connectionCheck;

  if (allPassed) {
    console.log('✅ All checks passed! App is ready for Shopify review.');
    console.log('\nNext steps:');
    console.log('1. Log into your dev store and interact with the app');
    console.log('2. Generate some test PDFs');
    console.log('3. Click through all sections (Dashboard, Settings, etc.)');
    console.log('4. Wait for Shopify\'s automated check (runs every 2 hours)');
  } else {
    console.log('❌ Some checks failed. Please fix before submitting to Shopify.');
    console.log('\nTroubleshooting:');
    console.log('- Check Docker is running: docker-compose ps');
    console.log('- Check logs: docker logs pdf-api --tail 50');
    console.log('- Verify .env has correct configuration');
  }

  console.log('');
}

runTests().catch(console.error);
