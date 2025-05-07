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
    
    const users = await User.find();
    let user = null;
    
    for (let u of users) {
      try {
        const decrypted = u.getDecryptedApiKey();
        if (decrypted === apiKey) {
          user = u;
          break;
        }
      } catch (e) {
        console.error("Decryption failed for user:", u.email, e.message);
      }
    }
    
    if (!user) {
      return res.status(403).json({ error: "User not found or API key is invalid" });
    }
    
    

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
