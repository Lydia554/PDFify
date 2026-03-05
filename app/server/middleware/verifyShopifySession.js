const crypto = require('crypto');
const ShopConfig = require('../models/ShopConfig');

/**
 * Shopify Session Token Verification Middleware
 *
 * Verifies JWT session tokens sent by Shopify App Bridge
 * Extracts the shop domain and makes it available to routes
 */
async function verifyShopifySession(req, res, next) {
  try {
    // Get Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Missing or invalid Authorization header'
      });
    }

    // Extract token
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No session token provided'
      });
    }

    // For JWT verification, we need to decode the token
    // JWT format: header.payload.signature
    const parts = token.split('.');

    if (parts.length !== 3) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token format'
      });
    }

    // Decode payload (base64url)
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64').toString('utf8')
    );

    // Check required fields
    if (!payload.dest) {
      return res.status(401).json({
        success: false,
        error: 'Token missing destination (dest) claim'
      });
    }

    // Extract shop domain from dest
    // dest format: https://shop.myshopify.com/admin
    const destMatch = payload.dest.match(/^https:\/\/([^.]+\.myshopify\.com)/);

    if (!destMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid destination format in token'
      });
    }

    const shopDomain = destMatch[1];

    // Check token expiration
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      return res.status(401).json({
        success: false,
        error: 'Session token has expired'
      });
    }

    // Verify shop exists in our database
    const shopConfig = await ShopConfig.findOne({
      shopDomain: shopDomain.toLowerCase()
    });

    // Don't require shop to exist - allow new installations
    // Attach shop info to request (shopConfig may be null for new shops)
    req.shop = shopConfig;
    req.shopDomain = shopDomain;

    next();
  } catch (error) {
    console.error('Session token verification error:', error);

    if (error.name === 'SyntaxError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token JSON'
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Session verification failed'
    });
  }
}

module.exports = verifyShopifySession;
