const axios = require('axios');
const readline = require('readline');

const API_BASE = 'https://pdfify.pro/api/shopify/util';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

async function listShops() {
  try {
    console.log('\n🔍 Fetching all shops from database...\n');
    const response = await axios.get(`${API_BASE}/list-shops`);

    if (response.data.success && response.data.shops.length > 0) {
      console.log(`Found ${response.data.shops.length} shop(s):\n`);
      response.data.shops.forEach((shop, i) => {
        console.log(`${i + 1}. ${shop.shopDomain}`);
        console.log(`   Company: ${shop.companyName || 'N/A'}`);
        console.log(`   Has Access Token: ${shop.hasAccessToken ? '✅ Yes' : '❌ No'}\n`);
      });
      return response.data.shops;
    } else {
      console.log('❌ No shops found in database');
      console.log('\n💡 You need to install the app on a test store first:');
      console.log('   1. Go to https://partners.shopify.com');
      console.log('   2. Select your app (PDFify Pro)');
      console.log('   3. Install on your test store\n');
      return [];
    }
  } catch (error) {
    console.error('❌ Error fetching shops:', error.response?.data || error.message);
    return [];
  }
}

async function cleanupShop(shopDomain) {
  try {
    console.log(`\n🧹 Cleaning up webhooks for ${shopDomain}...\n`);

    const response = await axios.post(`${API_BASE}/cleanup-webhooks`, {
      shopDomain: shopDomain
    });

    if (response.data.success) {
      console.log(`✅ Cleanup complete!\n`);
      console.log(`Deleted: ${response.data.deleted} webhook(s)`);
      console.log(`Failed: ${response.data.failed} webhook(s)\n`);

      if (response.data.webhooks && response.data.webhooks.length > 0) {
        console.log('Details:');
        response.data.webhooks.forEach(w => {
          console.log(`  ${w.status === 'deleted' ? '✅' : '❌'} ${w.topic}`);
        });
      }

      console.log('\n📝 Next steps:');
      response.data.nextSteps.forEach(step => console.log(`   ${step}`));
      console.log('\n⚠️  IMPORTANT: Reinstall the app on your test store');
    }
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

async function cleanupAllShops() {
  try {
    console.log('\n🧹 Cleaning up webhooks for ALL shops...\n');

    const response = await axios.post(`${API_BASE}/cleanup-webhooks`, {});

    if (response.data.success) {
      console.log(`✅ Cleanup complete!\n`);
      console.log(`Deleted: ${response.data.deleted} webhook(s)`);
      console.log(`Failed: ${response.data.failed} webhook(s)\n`);
    }
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   Shopify Webhook Cleanup Utility             ║');
  console.log('╚════════════════════════════════════════════════╝');

  const shops = await listShops();

  if (shops.length === 0) {
    rl.close();
    return;
  }

  if (shops.length === 1) {
    // Only one shop, auto-select it
    const shop = shops[0].shopDomain;
    console.log(`✅ Auto-selected only shop: ${shop}`);
    await cleanupShop(shop);
  } else {
    // Multiple shops, ask user to choose
    const choice = await question('\nEnter shop number to clean up (or "all" for all shops): ');

    if (choice.toLowerCase() === 'all') {
      await cleanupAllShops();
    } else {
      const index = parseInt(choice) - 1;
      if (index >= 0 && index < shops.length) {
        await cleanupShop(shops[index].shopDomain);
      } else {
        console.log('❌ Invalid selection');
      }
    }
  }

  console.log('\n✨ Done! Run "node test-all-webhooks.js" to verify.\n');
  rl.close();
}

main().catch(console.error);
