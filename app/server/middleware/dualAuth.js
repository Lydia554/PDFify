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

  try {
    let user = null;

    // First try API key auth
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
        return res.status(403).json({ error: "User not found or inactive" });
      }
    }


    if (!user && req.session && typeof req.session.userId === "string") {
  user = await User.findById(req.session.userId);
  if (!user || user.deleted) {
    return res.status(403).json({ error: "User not found or inactive" });
  }
}



    if (!user && req.session?.userId) {
      user = await User.findById(req.session.userId);
      if (!user || user.deleted) {
        return res.status(403).json({ error: "User not found or inactive" });
      }
    }

    if (!user) {
      return res.status(403).json({ error: "Authentication failed" });
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
