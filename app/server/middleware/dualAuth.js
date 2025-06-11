const User = require("../models/User");

const dualAuth = async (req, res, next) => {
  // 1. Try session-based auth first
  if (req.session?.userId) {
    const user = await User.findById(req.session.userId);
    if (!user || user.deleted) {
      return res.status(403).json({ error: "Session invalid or user deleted" });
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
    return next();
  }

  // 2. Fallback to API key (from your existing logic)
  let apiKey;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    apiKey = authHeader.split(" ")[1];
  }
  if (!apiKey) apiKey = req.query.apiKey;

  if (!apiKey) {
    return res.status(403).json({ error: "No session or API key provided" });
  }

  try {
    const users = await User.find();
    const user = users.find(u => {
      try {
        const decrypted = u.getDecryptedApiKey();
        return decrypted === apiKey;
      } catch (e) {
        return false;
      }
    });

    if (!user || user.deleted) {
      return res.status(403).json({ error: "User not found or inactive" });
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
    return next();
  } catch (err) {
    console.error("Dual auth error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = dualAuth;
