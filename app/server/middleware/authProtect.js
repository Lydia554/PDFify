// middleware/authProtect.js
const dualAuth = require("./dualAuth");

module.exports = async (req, res, next) => {
  try {
    console.log("🛡️ [AUTH_PROTECT] ========== PROTECTED ROUTE ACCESS ==========");
    console.log("🛣️ [AUTH_PROTECT] Path:", req.path);
    console.log("🛣️ [AUTH_PROTECT] URL:", req.url);
    console.log("🆔 [AUTH_PROTECT] Session ID:", req.sessionID);
    console.log("🍪 [AUTH_PROTECT] Has session:", !!req.session);
    console.log("👤 [AUTH_PROTECT] Session userId:", req.session?.userId);
    console.log("🔑 [AUTH_PROTECT] API Key header:", req.get('Authorization') ? 'Present' : 'Missing');

    // If session exists, allow
    if (req.session && req.session.userId) {
      console.log("✅ [AUTH_PROTECT] Session VALID - allowing access");
      console.log("👤 [AUTH_PROTECT] User ID:", req.session.userId);
      console.log("🛡️ [AUTH_PROTECT] ========== ACCESS GRANTED ==========");
      return next();
    }

    console.log("⚠️ [AUTH_PROTECT] No valid session - trying dualAuth (API key)...");

    // Otherwise, try dualAuth (API key)
    await dualAuth(req, res, () => {
      console.log("✅ [AUTH_PROTECT] dualAuth succeeded - allowing access");
      console.log("🛡️ [AUTH_PROTECT] ========== ACCESS GRANTED ==========");
      next();
    });

  } catch (err) {
    // If both fail, redirect to login
    console.error("❌ [AUTH_PROTECT] Both auth methods FAILED");
    console.error("📋 [AUTH_PROTECT] Error:", err.message);
    console.error("🔄 [AUTH_PROTECT] Redirecting to /login.html");
    console.log("🛡️ [AUTH_PROTECT] ========== ACCESS DENIED ==========");
    return res.redirect("/login.html");
  }
};
