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
    const query = `
      query {
        shop {
          brand {
            logo {
              image {
                url
              }
            }
          }
        }
      }
    `;

    const response = await axios.post(
      `https://${shopDomain}/admin/api/2024-04/graphql.json`, // Using a recent, stable API version
      { query },
      {
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
        },
      }
    );

    const logoUrl = response.data?.data?.shop?.brand?.logo?.image?.url;
    if (logoUrl) {
      console.log(`[getShopLogoUrl] Found logo URL: ${logoUrl}`);
    } else {
      console.log(`[getShopLogoUrl] Logo URL not found in GraphQL response.`);
    }
    return logoUrl || null;

  } catch (err) {
    if (err.response && err.response.data && err.response.data.errors) {
      console.error("❌ Error fetching shop logo via GraphQL:", JSON.stringify(err.response.data.errors, null, 2));
    } else {
      console.error("❌ Error fetching shop logo via GraphQL:", err.message);
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
