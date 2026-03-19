const jwt = require('jsonwebtoken');
const ShopConfig = require('../models/ShopConfig');

/**
 * Shopify Session Token Verification Middleware
 *
 * Verifies JWT session tokens sent by Shopify App Bridge
 * Extracts shop domain and makes it available to routes
 *
 * Requirements:
 * - JWT signature verification using SHOPIFY_CLIENT_SECRET
 * - Verify aud (audience) claim matches SHOPIFY_CLIENT_ID
 * - Verify dest (destination) claim format
 * - Verify token expiration
 */
async function verifyShopifySession(req, res, next) {
  try {
    // Get Authorization header
    const authHeader = req.headers.authorization;

    console.log('🔐 [SESSION] Verifying session token for:', req.path);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ [SESSION] Missing or invalid Authorization header');
      return res.status(401).json({
        success: false,
        error: 'Missing or invalid Authorization header'
      });
    }

    // Extract token
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    console.log('✅ [SESSION] Token received, length:', token.length);

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No session token provided'
      });
    }

    // Verify JWT signature and claims
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error('❌ [SESSION] SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET not configured');
      return res.status(500).json({
        success: false,
        error: 'Server configuration error'
      });
    }

    console.log('🔑 [SESSION] Verifying JWT signature...');

    // Verify JWT signature and claims
    const decoded = jwt.verify(token, clientSecret, {
      algorithms: ['HS256'],
      audience: clientId,
      issuer: clientId
    });

    console.log('✅ [SESSION] JWT signature verified');
    console.log('📋 [SESSION] Token payload dest:', decoded.dest);
    console.log('📋 [SESSION] Token payload aud:', decoded.aud);
    console.log('📋 [SESSION] Token payload iss:', decoded.iss);
    console.log('📋 [SESSION] Token payload exp:', decoded.exp);

    // Extract shop domain from dest
    // dest format: https://shop.myshopify.com/admin
    const destMatch = decoded.dest.match(/^https:\/\/([^.]+\.myshopify\.com)/);

    if (!destMatch) {
      console.log('❌ [SESSION] Invalid dest format:', decoded.dest);
      return res.status(401).json({
        success: false,
        error: 'Invalid destination format in token'
      });
    }

    const shopDomain = destMatch[1];
    console.log('🏪 [SESSION] Extracted shop domain:', shopDomain);

    console.log('✅ [SESSION] Token valid, looking up shop in DB...');

    // Verify shop exists in our database
    const shopConfig = await ShopConfig.findOne({
      shopDomain: shopDomain.toLowerCase()
    });

    console.log(shopConfig ? '✅ [SESSION] Shop found in DB' : '⚠️  [SESSION] Shop not found in DB (will create)');

    // Don't require shop to exist - allow new installations
    // Attach shop info to request (shopConfig may be null for new shops)
    req.shop = shopConfig;
    req.shopDomain = shopDomain;
    req.sessionToken = token; // Attach session token for API calls
    req.decodedToken = decoded; // Attach decoded token for reference

    next();
  } catch (error) {
    console.error('❌ [SESSION] Verification error:', error.message);
    console.error('❌ [SESSION] Error name:', error.name);

    // Handle JWT-specific errors
    if (error.name === 'JsonWebTokenError') {
      console.error('❌ [SESSION] Invalid JWT signature:', error.message);
      return res.status(401).json({
        success: false,
        error: 'Invalid session token signature'
      });
    }

    if (error.name === 'TokenExpiredError') {
      console.error('❌ [SESSION] Token expired');
      return res.status(401).json({
        success: false,
        error: 'Session token has expired'
      });
    }

    if (error.name === 'NotBeforeError') {
      console.error('❌ [SESSION] Token not yet valid');
      return res.status(401).json({
        success: false,
        error: 'Session token not yet valid'
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Session verification failed'
    });
  }
}

module.exports = verifyShopifySession;
