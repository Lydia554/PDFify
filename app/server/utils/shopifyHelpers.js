const axios = require("axios");
const User = require("../models/User"); // Adjust path if needed

// Resolves the Shopify access token from request headers or DB
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

// Fetches product image from Shopify using the product ID
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

// Enriches line items by adding product images
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

module.exports = {
  resolveShopifyToken,
  fetchProductImage,
  enrichLineItemsWithImages,
};
