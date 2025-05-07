const User = require("../models/User");

const authenticate = async (req, res, next) => {
  let apiKey = null;


  if (req.headers.authorization?.startsWith("Bearer ")) {
    apiKey = req.headers.authorization.split(" ")[1];
  } else if (req.query.apiKey) {
    apiKey = req.query.apiKey;
  }

  if (!apiKey) {
    return res.status(403).json({ error: "API key not provided" });
  }

  try {
    const users = await User.find();

    let authenticatedUser = null;

    for (const u of users) {
      try {
        const decryptedKey = u.getDecryptedApiKey();
        if (decryptedKey === apiKey) {
          authenticatedUser = u;
          break;
        }
      } catch (err) {
        console.warn("Failed to decrypt API key for user:", u.email);
      }
    }

    if (!authenticatedUser) {
      return res.status(403).json({ error: "User not found or API key is invalid" });
    }

    req.user = authenticatedUser;
    req.userData = {
      email: authenticatedUser.email,
      apiKey: authenticatedUser.getDecryptedApiKey(),
      usageCount: authenticatedUser.usageCount,
      maxUsage: authenticatedUser.maxUsage,
      isPremium: authenticatedUser.isPremium,
      userId: authenticatedUser._id,
    };

    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = authenticate;
