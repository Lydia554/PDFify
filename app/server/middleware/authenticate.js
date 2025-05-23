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

    const user = users.find((u) => {
      try {
        const decrypted = u.getDecryptedApiKey();
        return decrypted === apiKey;
      } catch (e) {
        return false;
      }
    });

    if (!user) {
     
      return res.status(403).json({ error: "User not found or API key is invalid" });
    }

    const decryptedKey = user.getDecryptedApiKey();
   

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

const users = await User.find();
users.forEach(u => {
  try {
    console.log("Decrypted key:", u.getDecryptedApiKey());
  } catch(e) {
    console.log("Decryption failed for user:", u.email);
  }
});


module.exports = authenticate;
