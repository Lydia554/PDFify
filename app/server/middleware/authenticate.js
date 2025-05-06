const User = require("../models/User");

const authenticate = async (req, res, next) => {
  let apiKey;

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    apiKey = authHeader.split(" ")[1];
  }

  if (!apiKey) apiKey = req.query.apiKey;

  if (!apiKey) {
    return res.status(403).json({ error: "API key not provided" });
  }

  try {
   
    const users = await User.find();


    let matchedUser = null;
    for (const user of users) {
      try {
        const decryptedKey = user.getDecryptedApiKey();
        if (decryptedKey === apiKey) {
          matchedUser = user;
          break;
        }
      } catch (err) {
        console.warn("Skipping user due to bad apiKey:", user._id);
      }
    }

    if (!matchedUser) {
      return res.status(403).json({ error: "Invalid API key" });
    }

    req.user = matchedUser;
    req.userData = {
      email: matchedUser.email,
      apiKey,
      usageCount: matchedUser.usageCount,
      maxUsage: matchedUser.maxUsage,
      isPremium: matchedUser.isPremium,
      userId: matchedUser._id,
    };

    next();
  } catch (err) {
    console.error("Authentication Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = authenticate;
