/**
 * Script to delete invalid Shopify webhooks via GraphQL Admin API
 *
 * Run this from PowerShell: node scripts/delete-shopify-webhooks.js
 */

const https = require('https');

// Your Shopify app credentials
const CLIENT_ID = 'e07548c088f572af4bbf103e4dee46bb';
const API_VERSION = '2024-10';

// You'll need to get your Admin API access token from:
// https://partners.shopify.com/YOUR_ORG/apps/YOUR_APP/admin/api_access
//
// Or use the CLI: shopify app token --admin
const ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

// The function to query webhooks
async function queryWebhooks() {
  return new Promise((resolve, reject) => {
    const query = `
      query {
        webhookSubscriptions(first: 50) {
          edges {
            node {
              id
              topic
              endpoint {
                url
                __typename
              }
              status
            }
          }
        }
      }
    `;

    const options = {
      hostname: 'partners.shopify.com',
      path: `/api/${API_VERSION}/graphql`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'X-Shopify-API-Caller-Type': 'CLI',  // Required for partner API calls
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.errors) {
            reject(new Error(json.errors.map(e => e.message).join('\n')));
          } else {
            resolve(json.data.webhookSubscriptions.edges);
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify({ query }));
    req.end();
  });
}

// The function to delete a webhook
async function deleteWebhook(webhookId) {
  return new Promise((resolve, reject) => {
    const mutation = `
      mutation webhookDelete($id: ID!) {
        webhookDelete(id: $id) {
          deletedWebhookId
          userErrors {
            field
            message
          }
        }
      }
    `;

    const options = {
      hostname: 'partners.shopify.com',
      path: `/api/${API_VERSION}/graphql`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'X-Shopify-API-Caller-Type': 'CLI',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.errors) {
            reject(new Error(json.errors.map(e => e.message).join('\n')));
          } else if (json.data.webhookDelete.userErrors.length > 0) {
            reject(new Error(json.data.webhookDelete.userErrors.map(e => e.message).join('\n')));
          } else {
            resolve(json.data.webhookDelete.deletedWebhookId);
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify({
      query: mutation,
      variables: { id: webhookId }
    }));
    req.end();
  });
}

// Main execution
async function main() {
  if (!ACCESS_TOKEN) {
    console.error('❌ ERROR: SHOPIFY_ADMIN_ACCESS_TOKEN environment variable not set');
    console.log('\nTo get your admin access token:');
    console.log('1. Run: shopify app token');
    console.log('2. Copy the Admin API token');
    console.log('3. Run: $env:SHOPIFY_ADMIN_ACCESS_TOKEN="your-token-here"');
    console.log('4. Run this script again\n');
    process.exit(1);
  }

  try {
    console.log('📋 Fetching registered webhooks...\n');
    const webhooks = await queryWebhooks();

    if (webhooks.length === 0) {
      console.log('✅ No webhooks found - nothing to delete!');
      return;
    }

    console.log(`Found ${webhooks.length} webhooks:\n`);
    webhooks.forEach(({ node }) => {
      console.log(`  - ${node.topic}`);
      console.log(`    ID: ${node.id}`);
      console.log(`    Endpoint: ${node.endpoint.url}`);
      console.log(`    Status: ${node.status}\n`);
    });

    // Filter out GDPR-related webhooks
    const gdprTopics = ['customers/data_request', 'customers/redact', 'shop/redact'];
    const gdprWebhooks = webhooks.filter(({ node }) =>
      gdprTopics.includes(node.topic)
    );

    if (gdprWebhooks.length === 0) {
      console.log('✅ No GDPR webhooks found to delete');
      return;
    }

    console.log(`\n🗑️  Found ${gdprWebhooks.length} GDPR webhooks to delete:`);
    gdprWebhooks.forEach(({ node }) => {
      console.log(`  - ${node.topic} (${node.id})`);
    });

    // Delete each GDPR webhook
    console.log('\nDeleting webhooks...\n');
    for (const { node } of gdprWebhooks) {
      try {
        await deleteWebhook(node.id);
        console.log(`✅ Deleted: ${node.topic}`);
      } catch (err) {
        console.error(`❌ Failed to delete ${node.topic}:`, err.message);
      }
    }

    console.log('\n✅ Done! Now you can deploy your new webhooks:');
    console.log('   shopify app deploy --allow-updates --allow-deletes');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
