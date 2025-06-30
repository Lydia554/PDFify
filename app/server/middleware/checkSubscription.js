
const checkSubscription = (requiredPlan = 'premium') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ error: "User not authenticated" });
    }

    const userPlan = req.user.plan; 

    const tiers = ['basic', 'premium', 'pro'];
    const userTierIndex = tiers.indexOf(userPlan);
    const requiredTierIndex = tiers.indexOf(requiredPlan);

    if (userTierIndex === -1 || userTierIndex < requiredTierIndex) {
      return res.status(403).json({
        error: `Access restricted to ${requiredPlan} users or higher`,
      });
    }

    next();
  };
};

module.exports = checkSubscription;