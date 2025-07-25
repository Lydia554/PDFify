const authenticate = async (req, res, next) => {
  let apiKey;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    apiKey = authHeader.split(" ")[1];
  }

  if (!apiKey) apiKey = req.query.apiKey;

  if (!apiKey) {
    console.warn("🚫 No API key provided");
    return res.status(403).json({ error: "API key not provided" });
  }

  try {
    const user = await User.findByDecryptedApiKey(apiKey);
    if (!user) {
      console.warn("🚫 API key invalid or user inactive");
      return res.status(403).json({ error: "User not found or API key is invalid" });
    }

    req.user = {
      userId: user._id,
      email: user.email,
      apiKey: user.getDecryptedApiKey(),
      usageCount: user.usageCount,
      maxUsage: user.maxUsage,
      isPremium: user.isPremium,
      planType: user.planType || "free",
    };

    req.fullUser = user;

    next();
  } catch (err) {
    console.error("❗ Authentication error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
