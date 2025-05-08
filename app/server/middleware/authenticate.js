const User = require("../models/User");

const authenticate = async (req, res, next) => {
  let apiKey;

  const authHeader = req.headers.authorization;
  console.log("🔐 [Auth] Authorization Header:", authHeader);

  if (authHeader && authHeader.startsWith("Bearer ")) {
    apiKey = authHeader.split(" ")[1];
  }

  if (!apiKey) {
    apiKey = req.query.apiKey;
  }

  console.log("🔑 [Auth] API key extracted from request:", apiKey);

  if (!apiKey) {
    return res.status(403).json({ error: "API key not provided" });
  }

  try {
    const users = await User.find();
    console.log("👥 [Auth] Total users:", users.length);

    const user = users.find((u) => {
      try {
        const decrypted = u.getDecryptedApiKey();
        console.log(`🧪 Comparing decrypted key: ${decrypted} === ${apiKey}`);
        return decrypted === apiKey;
      } catch (e) {
        console.warn("⚠️ [Auth] Decryption failed for user:", u.email);
        return false;
      }
    });

    if (!user) {
      console.log("❌ [Auth] No matching user found for provided API key.");
      return res.status(403).json({ error: "User not found or API key is invalid" });
    }

    console.log("✅ [Auth] User authenticated:", user.email);

    // ✅ Attach the full user object to req.user
    req.user = user;

    // You can also create a sanitized version of the data if needed
    req.userData = {
      email: user.email,
      apiKey: user.getDecryptedApiKey(), // if you need this specific value elsewhere
      usageCount: user.usageCount,
      maxUsage: user.maxUsage,
      isPremium: user.isPremium,
    };

    next();
  } catch (error) {
    console.error("🔥 [Auth] Authentication Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = authenticate;
