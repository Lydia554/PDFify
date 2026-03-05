// middleware/authProtect.js
const dualAuth = require("./dualAuth");

module.exports = async (req, res, next) => {
  try {
    // If session exists, allow
    if (req.session && req.session.userId) {
      console.log("[AUTH_PROTECT] ✅ Session valid - User:", req.session.userId, "Path:", req.path);
      return next();
    }

    // Otherwise, try dualAuth (API key)
    console.log("[AUTH_PROTECT] ⚠️ No session, trying API key for:", req.path);
    await dualAuth(req, res, () => {
      next();
    });

  } catch (err) {
    // If both fail, redirect to login
    console.log("[AUTH_PROTECT] ❌ Auth failed, redirecting to login");
    return res.redirect("/login.html");
  }
};
