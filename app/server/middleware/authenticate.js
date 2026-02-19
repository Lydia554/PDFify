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

  // Helper function to handle auth failure
  const authFailed = (message, statusCode = 403) => {
    const acceptsHtml = req.headers.accept && req.headers.accept.includes('text/html');

    if (acceptsHtml) {
      return res.redirect('/login.html');
    }
    return res.status(statusCode).json({ error: message });
  };

  if (!apiKey) {
    return authFailed("API key not provided", 403);
  }

  try {
    const users = await User.find();

  const user = users.find((u) => {
  try {
    const decrypted = u.getDecryptedApiKey();
    console.log(`Trying API key for user ${u.email}: decrypted = ${decrypted}`);
    return decrypted === apiKey;
  } catch (e) {
    console.error(`Error decrypting API key for user ${u.email}:`, e.message);
    return false;
  }
});

if (!user || user.deleted) {
  return authFailed("User not found or inactive", 401);
}

    const decryptedKey = user.getDecryptedApiKey();

   
    req.user = {
      userId: user._id,
      email: user.email,
      apiKey: decryptedKey,
      usageCount: user.usageCount,
      maxUsage: user.maxUsage,
      isPremium: user.isPremium,
       planType: user.planType || "Free", 
       shopDomain: user.shopDomain || user.email,
    };

   
    req.fullUser = user;

    next();
  } catch (error) {
    console.error("Authentication Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = authenticate;
