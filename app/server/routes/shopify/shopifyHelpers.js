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
    // 1. Get all themes
    const themesResponse = await axios.get(`https://${shopDomain}/admin/api/2024-04/themes.json`, {
      headers: { 'X-Shopify-Access-Token': token },
    });
    
    // 2. Find the main theme
    const mainTheme = themesResponse.data.themes.find(theme => theme.role === 'main');
    if (!mainTheme) {
      return null;
    }
    
    // 3. Get the theme's settings data
    const settingsResponse = await axios.get(`https://${shopDomain}/admin/api/2024-04/themes/${mainTheme.id}/assets.json?asset[key]=config/settings_data.json`, {
      headers: { 'X-Shopify-Access-Token': token },
    });
    
    const settingsData = JSON.parse(settingsResponse.data.asset.value);
    
    // 4. Find the logo filename in settings
    const presetName = settingsData.current;
    const currentSettings = settingsData.presets[presetName];

    if (!currentSettings) {
        return null;
    }

    const headerSettings = currentSettings.sections?.header?.settings || {};
    // Check common locations for the logo filename
    const logoFilename = currentSettings.logo || headerSettings.logo || currentSettings.logo_image || headerSettings.logo_image;
    
    if (!logoFilename) {
      return null;
    }

    // 5. Get the public URL for the asset
    const assetResponse = await axios.get(`https://${shopDomain}/admin/api/2024-04/themes/${mainTheme.id}/assets.json?asset[key]=assets/${logoFilename}`, {
        headers: { 'X-Shopify-Access-Token': token },
    });

    return assetResponse.data.asset.public_url || null;

  } catch (err) {
    // Silently fail, as a missing logo should not block PDF generation.
    return null;
  }
}

module.exports = {
  resolveShopifyToken,
  fetchProductImage,
  enrichLineItemsWithImages,
  getShopLogoUrl
};
