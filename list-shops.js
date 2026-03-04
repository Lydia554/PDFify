const axios = require('axios');

// Try to list all shops in your database
const apiURL = 'https://pdfify.pro/api/shopify/config';

console.log('🔍 Looking for shops in your database...\n');

axios.get(apiURL)
  .then(response => {
    console.log('✅ Found shops:\n');

    if (response.data && response.data.shops) {
      response.data.shops.forEach((shop, i) => {
        console.log(`${i + 1}. Shop Domain: ${shop.shopDomain || shop.domain}`);
        console.log(`   Has Access Token: ${shop.hasAccessToken ? 'Yes' : 'No'}`);
        console.log(`   Plan: ${shop.planType || 'N/A'}`);
        console.log();
      });
    } else if (response.data && response.data.shopDomain) {
      // Single shop response
      console.log(`1. Shop Domain: ${response.data.shopDomain}`);
      console.log(`   Company Name: ${response.data.companyName || 'N/A'}`);
      console.log(`   Plan: ${response.data.planType || 'N/A'}`);
      console.log();
    } else {
      console.log('Response:', JSON.stringify(response.data, null, 2));
    }

    console.log('\n📝 Copy the shop domain from above and update run-cleanup.js');
  })
  .catch(error => {
    if (error.response?.status === 404) {
      console.log('❌ No shops found in database');
      console.log('\n💡 You need to install the app on your test store first:');
      console.log('   1. Go to https://partners.shopify.com');
      console.log('   2. Select your app (PDFify Pro)');
      console.log('   3. Click "Test app"');
      console.log('   4. Install on your test store');
    } else if (error.response?.status === 401) {
      console.log('❌ Authentication required');
      console.log('   This endpoint should be public for debugging');
    } else {
      console.error('❌ Error:', error.response?.data || error.message);
    }
  });
