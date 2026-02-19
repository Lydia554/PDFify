const User = require("../models/User");

const dualAuth = async (req, res, next) => {
  let apiKey;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    apiKey = authHeader.split(" ")[1];
  }

  if (!apiKey && req.query.apiKey) {
    apiKey = req.query.apiKey;
  }

  // Helper function to handle auth failure - redirect for browser requests, JSON for API
  const authFailed = (message, statusCode = 401) => {
    const acceptsHtml = req.headers.accept && req.headers.accept.includes('text/html');

    if (acceptsHtml) {
      // Browser navigation - redirect to login
      return res.redirect('/login.html');
    }
    // API request - return JSON error
    return res.status(statusCode).json({ error: message });
  };

  try {
    let user = null;


    if (apiKey) {
      const users = await User.find();
      user = users.find(u => {
        try {
          const decrypted = u.getDecryptedApiKey();
          return decrypted === apiKey;
        } catch (e) {
          return false;
        }
      });

      if (!user || user.deleted) {
        return authFailed("User not found or inactive", 403);
      }
    }


    if (!user && req.session && typeof req.session.userId === "string") {
  user = await User.findById(req.session.userId);
  if (!user || user.deleted) {
    return authFailed("User not found or inactive", 403);
  }
}



    if (!user && req.session?.userId) {
      user = await User.findById(req.session.userId);
      if (!user || user.deleted) {
        return authFailed("User not found or inactive", 401);
      }
    }

    if (!user) {
      return authFailed("Authentication failed", 401);
    }

    req.user = {
      userId: user._id,
      email: user.email,
      apiKey: user.getDecryptedApiKey(),
      usageCount: user.usageCount,
      maxUsage: user.maxUsage,
      isPremium: user.isPremium,
    };

    req.fullUser = user;
    next();
  } catch (err) {
    console.error("DualAuth error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = dualAuth;
