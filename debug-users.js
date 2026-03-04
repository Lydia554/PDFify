const axios = require('axios');

// We'll create a debug endpoint to see what's in the User collection
const apiURL = 'https://pdfify.pro/api/shopify/util/debug-users';

console.log('🔍 Fetching user data from database...\n');

axios.get(apiURL)
  .then(response => {
    console.log('✅ Found users:\n');
    console.log(JSON.stringify(response.data, null, 2));
  })
  .catch(error => {
    if (error.response?.status === 404) {
      console.log('❌ Debug endpoint not found yet (might not be deployed)\n');

      console.log('💡 Let me help you find the access token another way:\n');
      console.log('1. Go to Shopify Partners: https://partners.shopify.com');
      console.log('2. Select your app (PDFify Pro)');
      console.log('3. Click "Apps" → Select your test store');
      console.log('4. Copy the Admin API access token\n');
      console.log('5. Then run: node cleanup-local.js\n');
    } else {
      console.error('❌ Error:', error.response?.data || error.message);
    }
  });
