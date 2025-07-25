const User = require("../models/User");

const dualAuth = async (req, res, next) => {
  let apiKey;

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    apiKey = authHeader.split(" ")[1];
  }

  if (!apiKey && req.query.apiKey) {
    apiKey = req.query.apiKey;
  }

  try {
    let user = null;

    // ✅ Try API key first
    if (apiKey) {
      user = await User.findByDecryptedApiKey(apiKey);
      if (!user || user.deleted) {
        return res.status(403).json({ error: "User not found or inactive (via API key)" });
      }
    }

    // ✅ Fallback to session if no user yet
    if (!user && req.session?.userId) {
      user = await User.findById(req.session.userId);
      if (!user || user.deleted) {
        return res.status(403).json({ error: "User not found or inactive (via session)" });
      }
    }

    // ❌ Still no user
    if (!user) {
      return res.status(403).json({ error: "Authentication failed" });
    }

    // ✅ Attach to request
    req.user = {
      userId: user._id,
      email: user.email,
      apiKey: user.getDecryptedApiKey(),
      usageCount: user.usageCount,
      maxUsage: user.maxUsage,
      isPremium: user.isPremium,
      planType: user.planType || "free",
    };

    req.fullUser = user;
    next();
  } catch (err) {
    console.error("🔐 DualAuth error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = dualAuth;
