const User = require("./models/User"); 
await mongoose.connect(process.env.MONGO_URI);

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
    for (const user of users) {
      try {
        const decrypted = decrypt(user.apiKey); 
        user.apiKey = encrypt(decrypted);
        await user.save();
        console.log(`Fixed API key for user: ${user.email}`);
      } catch (e) {
        console.error(`Could not fix API key for ${user.email}:`, e.message);
      }
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
