const axios = require("axios");
const User = require("../../models/User"); 

async function resolveShopifyToken(req, shopDomain) {
  let token = req.body?.shopifyAccessToken || req.headers["x-shopify-access-token"];

  if (!token && req.user?.userId) {
    const user = await User.findById(req.user.userId);
    if (user?.connectedShopDomain === shopDomain && user.shopifyAccessToken) {
      token = user.shopifyAccessToken;
    }
  }

  if (!token) {
    const fallbackUser = await User.findOne({ connectedShopDomain: shopDomain });
    if (fallbackUser?.shopifyAccessToken) {
      token = fallbackUser.shopifyAccessToken;
    }
  }

  return token;
}


async function fetchProductImage(productId, shopDomain, token) {
  if (!productId) return null;

  try {
    const url = `https://${shopDomain}/admin/api/2023-10/products/${productId}.json`;
    const response = await axios.get(url, {
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
    });

    return response.data.product?.image?.src || null;
  } catch (err) {
    console.warn(`⚠️ Could not fetch image for product ${productId}:`, err.message);
    return null;
  }
}


async function enrichLineItemsWithImages(lineItems, shopDomain, token) {
  return Promise.all(
    lineItems.map(async (item) => ({
      name: item.name || item.title,
      quantity: item.quantity,
      price: Number(item.price) || 0,
      imageUrl: await fetchProductImage(item.product_id, shopDomain, token),
    }))
  );
}

async function getShopLogoUrl(shopDomain, token) {
  try {
    console.log('[getShopLogoUrl] Attempting to find logo via Theme API...');
    
    // 1. Get all themes
    const themesResponse = await axios.get(`https://${shopDomain}/admin/api/2024-04/themes.json`, {
      headers: { 'X-Shopify-Access-Token': token },
    });
    
    // 2. Find the main theme
    const mainTheme = themesResponse.data.themes.find(theme => theme.role === 'main');
    if (!mainTheme) {
      console.log('[getShopLogoUrl] Could not find a main theme.');
      return null;
    }
    console.log(`[getShopLogoUrl] Found main theme: ${mainTheme.name} (${mainTheme.id})`);
    
    // 3. Get the theme's settings data
    const settingsResponse = await axios.get(`https://${shopDomain}/admin/api/2024-04/themes/${mainTheme.id}/assets.json?asset[key]=config/settings_data.json`, {
      headers: { 'X-Shopify-Access-Token': token },
    });
    
    const settingsData = JSON.parse(settingsResponse.data.asset.value);

    // --- DIAGNOSTIC LOGGING ---
    console.log("---------- [DEBUG] Shopify Theme Settings Data ----------");
    console.log("WARNING: This contains theme configuration. Do not share publicly.");
    console.log(JSON.stringify(settingsData, null, 2));
    console.log("-------------------------------------------------------");
    
    // 4. Find the logo filename in settings
    const logoFilename = settingsData?.current?.logo || settingsData?.current?.sections?.header?.settings?.logo;
    
    if (!logoFilename) {
      console.log('[getShopLogoUrl] Could not find logo filename in theme settings.');
      return null;
    }
    console.log(`[getShopLogoUrl] Found logo filename: ${logoFilename}`);

    // 5. Get the public URL for the asset
    const assetResponse = await axios.get(`https://${shopDomain}/admin/api/2024-04/themes/${mainTheme.id}/assets.json?asset[key]=assets/${logoFilename}`, {
        headers: { 'X-Shopify-Access-Token': token },
    });

    const logoUrl = assetResponse.data.asset.public_url;
    if (logoUrl) {
        console.log(`[getShopLogoUrl] Successfully retrieved public logo URL: ${logoUrl}`);
    } else {
        console.log('[getShopLogoUrl] Could not retrieve public URL for the logo asset.');
    }

    return logoUrl || null;

  } catch (err) {
    if (err.response) {
      console.error("❌ Error fetching shop logo via Theme API:", JSON.stringify(err.response.data, null, 2));
    } else {
      console.error("❌ Error fetching shop logo via Theme API:", err.message);
    }
    return null;
  }
}

module.exports = {
  resolveShopifyToken,
  fetchProductImage,
  enrichLineItemsWithImages,
  getShopLogoUrl
};
