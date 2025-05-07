const User = require("../models/User");

const authenticate = async (req, res, next) => {
  let apiKey;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    apiKey = authHeader.split(" ")[1];
    console.log("🔐 Bearer token extracted:", apiKey);
  }

  if (!apiKey) {
    apiKey = req.query.apiKey;
    console.log("🔑 API key from query:", apiKey);
  }

  if (!apiKey) {
    console.log("🚫 No API key provided");
    return res.status(403).json({ error: "API key not provided" });
  }

  try {
    const users = await User.find();
    console.log("👥 All users fetched from DB:", users.length);

    const user = users.find((u) => {
      try {
        const decryptedKey = u.getDecryptedApiKey();
        console.log(`🔍 Checking user: ${u.email} with decrypted key: ${decryptedKey}`);
        return decryptedKey === apiKey;
      } catch (e) {
        console.warn(`⚠️ Decryption failed for user: ${u.email}`, e.message);
        return false;
      }
    });

    if (!user) {
      console.log("❌ No matching user found for provided API key:", apiKey);
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

    console.log("✅ Authenticated user:", req.userData.email);
    next();
  } catch (error) {
    console.error("🔥 Authentication Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = authenticate;
