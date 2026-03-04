const axios = require('axios');

const apiURL = 'https://pdfify.pro/api/shopify/util/debug-users';

console.log('╔════════════════════════════════════════════════╗');
console.log('║   Debug User Database                         ║');
console.log('╚════════════════════════════════════════════════╝\n');

console.log('🔍 Fetching user data from database...\n');

axios.get(apiURL)
  .then(response => {
    const data = response.data;

    if (!data.success || data.users.length === 0) {
      console.log('❌ No users found with Shopify connections\n');
      console.log('💡 This means no users have installed the app yet.\n');
      console.log('To fix webhook issues manually:\n');
      console.log('1. Go to Shopify Partners: https://partners.shopify.com');
      console.log('2. Select your app (PDFify Pro)');
      console.log('3. Click "Apps" → Select your test store');
      console.log('4. Copy the Admin API access token');
      console.log('5. Run: node cleanup-local.js\n');
      return;
    }

    console.log(`✅ Found ${data.count} user(s) with Shopify connections:\n`);

    data.users.forEach((user, i) => {
      console.log(`${i + 1}. Email: ${user.email || 'N/A'}`);
      console.log(`   Connected Shop: ${user.connectedShopDomain || 'Not connected'}`);
      console.log(`   Has Access Token: ${user.hasAccessToken ? '✅ Yes' : '❌ No'}`);
      if (user.hasAccessToken) {
        console.log(`   Token Preview: ${user.accessTokenPreview}`);
      }
      console.log(`   Plan: ${user.planType}`);
      console.log(`   Premium: ${user.isPremium ? 'Yes' : 'No'}`);
      console.log();
    });

    // Check if any users have access tokens
    const usersWithTokens = data.users.filter(u => u.hasAccessToken);

    if (usersWithTokens.length === 0) {
      console.log('⚠️  No users have access tokens!\n');
      console.log('💡 This means the app was installed but access tokens were not saved.');
      console.log('To clean up webhooks manually, use: node cleanup-local.js\n');
    } else {
      console.log(`✅ ${usersWithTokens.length} user(s) have access tokens - you can use cleanup-interactive.js\n`);
    }
  })
  .catch(error => {
    if (error.response) {
      console.log(`❌ Error ${error.response.status}: ${error.response.statusText}\n`);

      if (error.response.status === 404) {
        console.log('💡 Debug endpoint not deployed yet.');
        console.log('   Wait for GitHub Actions to complete deployment.\n');
      } else if (error.response.status === 502) {
        console.log('💡 Server is down or restarting.');
        console.log('   Wait a few minutes for GitHub Actions deployment.\n');
      }
    } else {
      console.error('❌ Error:', error.message);
    }
  });

