require('dotenv').config();
const mongoose = require('mongoose');
const ShopConfig = require('./app/server/models/ShopConfig');
const User = require('./app/server/models/User');

async function checkInstallation() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to database\n');

    // Check ShopConfig
    const shopConfigs = await ShopConfig.find({});
    console.log(`📊 Found ${shopConfigs.length} shop(s) in database:`);
    shopConfigs.forEach(shop => {
      console.log(`\n🏪 Shop: ${shop.shopDomain}`);
      console.log(`   Active: ${shop.isActive}`);
      console.log(`   Connected: ${shop.connectedAt || 'Never'}`);
      console.log(`   Customer PDF: ${shop.allowCustomerPDF}`);
    });

    // Check Users with Shopify connected
    const users = await User.find({ connectedShopDomain: { $exists: true, $ne: null } });
    console.log(`\n\n👤 Found ${users.length} user(s) with Shopify connected:`);
    users.forEach(user => {
      console.log(`\n📧 Email: ${user.email}`);
      console.log(`   Shop: ${user.connectedShopDomain}`);
      console.log(`   Has Token: ${user.shopifyAccessToken ? '✅ Yes' : '❌ No'}`);
    });

    if (shopConfigs.length === 0 && users.length === 0) {
      console.log('\n⚠️ No installations found yet. The OAuth flow may not have completed.');
    }

    await mongoose.disconnect();
    console.log('\n✅ Check complete!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkInstallation();
