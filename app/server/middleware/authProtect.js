// middleware/authProtect.js
const dualAuth = require("./dualAuth");

module.exports = async (req, res, next) => {
  try {
    // Debug logging
    if (process.env.NODE_ENV !== "production") {
      console.log("[authProtect] Session check:", {
        hasSession: !!req.session,
        hasUserId: !!(req.session && req.session.userId),
        sessionId: req.sessionID,
        path: req.path,
      });
    }

    // If session exists, allow
    if (req.session && req.session.userId) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[authProtect] ✅ Session valid, allowing access");
      }
      return next();
    }

    // Otherwise, try dualAuth (API key)
    if (process.env.NODE_ENV !== "production") {
      console.log("[authProtect] ⚠️ No session, trying dualAuth (API key)");
    }
    await dualAuth(req, res, () => {
      next();
    });

  } catch (err) {
    // If both fail, redirect to login
    if (process.env.NODE_ENV !== "production") {
      console.log("[authProtect] ❌ Both auth methods failed, redirecting to login");
    }
    return res.redirect("/login.html");
  }
};
