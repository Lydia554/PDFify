
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

// Fetches the shop logo URL from Shopify shop info
async function fetchShopLogo(shopDomain, token) {
  try {
    const url = `https://${shopDomain}/admin/api/2023-04/shop.json`;
    const response = await axios.get(url, {
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
    });

    // Shopify does not officially provide a 'logo' property on the shop object,
    // but some themes/apps may add it or you can fallback to shop domain or other branding.
    // Adjust this logic as per your actual API response.
    if (response.data && response.data.shop) {
      // Example fallback: use shop.domain or shop.name or empty
      // If you have a custom metafield or setting for logo, you'd fetch that differently.
      return response.data.shop.logo || null;
    }

    return null;
  } catch (err) {
    console.error("❌ Failed to fetch shop logo:", err.message);
    return null;
  }
}

module.exports = {
  resolveShopifyToken,
  fetchProductImage,
  enrichLineItemsWithImages,
  fetchShopLogo,  // <-- export it here
};