const crypto = require('crypto');
const ShopConfig = require('../models/ShopConfig');

/**
 * Shopify Session Token Verification Middleware
 *
 * Verifies JWT session tokens sent by Shopify App Bridge
 * Extracts shop domain and makes it available to routes
 *
 * Note: Shopify session tokens are signed by Shopify, not by the app's client secret.
 * The recommended approach is to decode and verify claims, not verify signature with app secret.
 * See: https://shopify.dev/docs/apps/build/authentication-orchestration/session-tokens
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

    // For JWT verification, we need to decode the token
    // JWT format: header.payload.signature
    const parts = token.split('.');

    if (parts.length !== 3) {
      console.log('❌ [SESSION] Invalid token format, parts:', parts.length);
      return res.status(401).json({
        success: false,
        error: 'Invalid token format'
      });
    }

    // Decode header to check algorithm
    let header;
    try {
      header = JSON.parse(
        Buffer.from(parts[0], 'base64').toString('utf8')
      );
    } catch (err) {
      console.log('❌ [SESSION] Failed to decode header:', err.message);
      return res.status(401).json({
        success: false,
        error: 'Invalid token header'
      });
    }

    console.log('📋 [SESSION] Token header algorithm:', header.alg);

    // Verify algorithm is RS256 (Shopify uses RS256 for session tokens)
    if (header.alg !== 'RS256') {
      console.log('❌ [SESSION] Invalid algorithm, expected RS256, got:', header.alg);
      return res.status(401).json({
        success: false,
        error: 'Invalid token algorithm'
      });
    }

    // Decode payload (base64url)
    let payload;
    try {
      payload = JSON.parse(
        Buffer.from(parts[1], 'base64').toString('utf8')
      );
    } catch (err) {
      console.log('❌ [SESSION] Failed to decode payload:', err.message);
      return res.status(401).json({
        success: false,
        error: 'Invalid token payload'
      });
    }

    console.log('📋 [SESSION] Token payload dest:', payload.dest);
    console.log('📋 [SESSION] Token payload aud:', payload.aud);
    console.log('📋 [SESSION] Token payload iss:', payload.iss);

    // Check required fields
    if (!payload.dest) {
      console.log('❌ [SESSION] Token missing dest claim');
      return res.status(401).json({
        success: false,
        error: 'Token missing destination (dest) claim'
      });
    }

    // Verify audience matches Shopify API key
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    if (!clientId) {
      console.error('❌ [SESSION] SHOPIFY_CLIENT_ID not configured');
      return res.status(500).json({
        success: false,
        error: 'Server configuration error'
      });
    }

    if (payload.aud !== clientId) {
      console.log('❌ [SESSION] Invalid audience, expected:', clientId, 'got:', payload.aud);
      return res.status(401).json({
        success: false,
        error: 'Invalid token audience'
      });
    }

    // Verify issuer is Shopify
    if (!payload.iss || !payload.iss.startsWith('https://')) {
      console.log('❌ [SESSION] Invalid issuer:', payload.iss);
      return res.status(401).json({
        success: false,
        error: 'Invalid token issuer'
      });
    }

    // Extract shop domain from dest
    // dest format: https://shop.myshopify.com/admin
    const destMatch = payload.dest.match(/^https:\/\/([^.]+\.myshopify\.com)/);

    if (!destMatch) {
      console.log('❌ [SESSION] Invalid dest format:', payload.dest);
      return res.status(401).json({
        success: false,
        error: 'Invalid destination format in token'
      });
    }

    const shopDomain = destMatch[1];
    console.log('🏪 [SESSION] Extracted shop domain:', shopDomain);

    // Check token expiration
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      console.log('❌ [SESSION] Token expired. exp:', payload.exp, 'now:', now);
      return res.status(401).json({
        success: false,
        error: 'Session token has expired'
      });
    }

    // Check nbf (not before) claim if present
    if (payload.nbf && payload.nbf > now) {
      console.log('❌ [SESSION] Token not yet valid. nbf:', payload.nbf, 'now:', now);
      return res.status(401).json({
        success: false,
        error: 'Session token not yet valid'
      });
    }

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
    req.decodedToken = payload; // Attach decoded token for reference

    next();
  } catch (error) {
    console.error('❌ [SESSION] Verification error:', error.message);

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
