const User = require("../models/User");

const authenticate = async (req, res, next) => {
  let apiKey;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    apiKey = authHeader.split(" ")[1];
  }

  if (!apiKey) {
    apiKey = req.query.apiKey;
  }

  if (!apiKey) {
    return res.status(403).json({ error: "API key not provided" });
  }

  try {
    
    const user = users.find((u) => {
      try {
        const decrypted = u.getDecryptedApiKey();
        console.log("🔍 Checking user:", u.email);
        console.log("🔑 Decrypted key:", decrypted);
        console.log("📥 Provided key:", apiKey);
        return decrypted.trim() === apiKey.trim(); // Trim just in case
      } catch (e) {
        console.error("❌ Decryption failed for", u.email, e.message);
        return false;
      }
    });

    if (!user) {
      return res.status(403).json({ error: "User not found or API key is invalid" });

    }

    req.user = user;

    req.userData = {
      email: user.email,
      apiKey: user.getDecryptedApiKey(),
      usageCount: user.usageCount,
      maxUsage: user.maxUsage,
      isPremium: user.isPremium,
      userId: user._id,
    };

    next();
  } catch (error) {
    console.error("Authentication Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = authenticate;
