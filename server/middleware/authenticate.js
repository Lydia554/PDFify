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
    const user = await User.findOne();
    if (!user || user.getDecryptedApiKey() !== apiKey) {
      return res.status(403).json({ error: "Invalid API key" });
    }

    req.user = user; // full mongoose doc (needed for .save, PDF generation, etc.)

    // Extract clean plain values for frontend use
    req.userData = {
      email: user.email,
      apiKey: user.getDecryptedApiKey(),
      usageCount: user.usageCount,
      maxUsage: user.maxUsage,
      isPremium: user.isPremium,
    };

    next();
  } catch (error) {
    console.error("Authentication Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = authenticate;
