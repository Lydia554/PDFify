const axios = require('axios');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

async function cleanupWithDirectToken() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   Shopify Webhook Cleanup (Direct API)        ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  console.log('Since your server is down, we can clean up webhooks directly via Shopify API.\n');

  const shopDomain = await question('Enter your shop domain (e.g., mystore-123.myshopify.com): ');
  const accessToken = await question('Enter your Shopify Admin API access token (shpat_xxx): ');

  if (!shopDomain || !accessToken) {
    console.log('❌ Both shop domain and access token are required');
    rl.close();
    return;
  }

  console.log(`\n🔍 Fetching existing webhooks from ${shopDomain}...\n`);

  try {
    // Fetch all webhooks
    const response = await axios.get(
      `https://${shopDomain}/admin/api/2026-01/webhooks.json`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken
        }
      }
    );

    const webhooks = response.data.webhooks;

    if (webhooks.length === 0) {
      console.log('✅ No existing webhooks found.');
      console.log('\n💡 If webhooks exist, they should be registered via shopify.app.toml');
      rl.close();
      return;
    }

    console.log(`Found ${webhooks.length} existing webhooks:\n`);
    webhooks.forEach((w, i) => {
      console.log(`${i + 1}. ${w.topic}`);
      console.log(`   → ${w.address}`);
      console.log(`   ID: ${w.id} | Format: ${w.format}\n`);
    });

    const confirm = await question('Delete all these webhooks? (yes/no): ');

    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log('❌ Cancelled');
      rl.close();
      return;
    }

    console.log('\n🗑️  Deleting all webhooks...\n');

    let deleted = 0;
    let failed = 0;

    for (const webhook of webhooks) {
      try {
        await axios.delete(
          `https://${shopDomain}/admin/api/2026-01/webhooks/${webhook.id}.json`,
          {
            headers: {
              'X-Shopify-Access-Token': accessToken
            }
          }
        );
        console.log(`✅ Deleted: ${webhook.topic} (${webhook.address})`);
        deleted++;
      } catch (err) {
        console.log(`❌ Failed: ${webhook.topic} - ${err.message}`);
        failed++;
      }
    }

    console.log(`\n✅ Cleanup complete!`);
    console.log(`   Deleted: ${deleted}`);
    console.log(`   Failed: ${failed}`);

    console.log('\n📝 Next steps:');
    console.log('   1. Reinstall the app on your test store');
    console.log('   2. Or run: shopify app deploy');
    console.log('   3. New webhooks will be registered via shopify.app.toml\n');

  } catch (error) {
    if (error.response?.status === 401) {
      console.error('❌ Authentication failed!');
      console.error('\n📝 To get your access token:');
      console.error('   1. Go to https://partners.shopify.com');
      console.error('   2. Select your app (PDFify Pro)');
      console.error('   3. Click "Apps" → Select your test store');
      console.error('   4. Copy the "Admin API access token"');
    } else {
      console.error('❌ Error:', error.response?.data || error.message);
    }
  }

  rl.close();
}

cleanupWithDirectToken();
