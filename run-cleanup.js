const axios = require('axios');

// Your test store domain (from your logs)
const shopDomain = 'mystore-123456789789457987.myshopify.com';
const apiURL = 'https://pdfify.pro/api/shopify/util/cleanup-webhooks';

console.log('🧹 Cleaning up Shopify webhooks...\n');
console.log('Shop Domain:', shopDomain);
console.log('API Endpoint:', apiURL);
console.log('\n---\n');

axios.post(apiURL, {
  shopDomain: shopDomain
})
.then(response => {
  console.log('✅ Success!\n');
  console.log('Response:', JSON.stringify(response.data, null, 2));

  if (response.data.success) {
    console.log(`\n✅ Deleted ${response.data.deleted} webhooks`);
    console.log(`❌ Failed to delete ${response.data.failed} webhooks\n`);

    if (response.data.webhooks && response.data.webhooks.length > 0) {
      console.log('Deleted webhooks:');
      response.data.webhooks.forEach(w => {
        console.log(`  ${w.status === 'deleted' ? '✅' : '❌'} ${w.topic}`);
      });
    }

    console.log('\n📝 Next steps:');
    response.data.nextSteps.forEach(step => console.log(`   ${step}`));
    console.log('\n⚠️  IMPORTANT: Reinstall the app on your test store to re-register webhooks via TOML');
  }
})
.catch(error => {
  console.error('❌ Error!\n');
  if (error.response) {
    console.error('Status:', error.response.status);
    console.error('Response:', JSON.stringify(error.response.data, null, 2));
  } else {
    console.error('Error:', error.message);
  }
});
