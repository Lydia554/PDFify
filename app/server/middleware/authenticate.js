const User = require("../models/User");

const authenticate = async (req, res, next) => {
  let apiKey;

  const authHeader = req.headers.authorization;
  console.log("Authorization Header:", authHeader); // 🔍

  if (authHeader && authHeader.startsWith("Bearer ")) {
    apiKey = authHeader.split(" ")[1];
    console.log("Extracted API Key from header:", apiKey); // 🔍
  }

  if (!apiKey) {
    apiKey = req.query.apiKey;
    console.log("Fallback API Key from query:", apiKey); // 🔍
  }

  if (!apiKey) {
    console.warn("❌ No API key provided");
    return res.status(403).json({ error: "API key not provided" });
  }

  try {
    const users = await User.find();

    const user = users.find((u) => {
      try {
        const decrypted = u.getDecryptedApiKey();
        return decrypted === apiKey;
      } catch (e) {
        return false;
      }
    });

    if (!user) {
      console.warn("❌ No user matched the API key");
      return res.status(403).json({ error: "User not found or API key is invalid" });
    }

    const decryptedKey = user.getDecryptedApiKey();
    console.log("✅ Authenticated user:", user.email);

    req.user = {
      userId: user._id,
      email: user.email,
      apiKey: decryptedKey,
      usageCount: user.usageCount,
      maxUsage: user.maxUsage,
      isPremium: user.isPremium,
    };

    req.fullUser = user;

    next();
  } catch (error) {
    console.error("Authentication Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = authenticate;
