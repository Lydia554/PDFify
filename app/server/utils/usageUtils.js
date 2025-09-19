const User = require("../models/User");

const PLAN_LIMITS = {
  free: 30,        // Free users: 30 pages/month
  premium: 1000,   // Premium users: 1,000 pages/month
  pro: 10000       // Pro users: 10,000 pages/month
};


async function incrementUsage(user, pages = 1, isPreview = false, forcePlan = null) {
  const plan = (forcePlan || user.planType || "free").toLowerCase();
  console.log(`🔍 incrementUsage called with plan="${plan}", isPreview=${isPreview}, pages=${pages}`);

  // Reset monthly usage if needed
  const now = new Date();
  if (!user.usageLastReset || new Date(user.usageLastReset).getMonth() !== now.getMonth()) {
    user.usageCount = 0;
    user.usageLastReset = now;
    await user.save();
    console.log("🔄 Usage reset for new month");
  }

  // Preview usage for free plan
  if (isPreview && plan === "free") {
    if (user.previewCount < 3) {
      user.previewCount++;
      await user.save();
      console.log(`👀 Incremented preview count to ${user.previewCount}`);
      return true;
    } else {
      console.log(`⚠️ Preview limit reached for free plan. Consuming quota now.`);
    }
  }

  const limit = PLAN_LIMITS[plan] || PLAN_LIMITS["free"];
  const totalLimit = limit + (user.extraPages || 0);

  // Check total available pages
  if (user.usageCount + pages > totalLimit) {
    console.log(`🚫 Usage limit exceeded for ${plan} plan. Requested ${pages} pages.`);
    return false;
  }

  // Increment usage
  user.usageCount += pages;

  // If we are over the plan limit, deduct from extraPages
  if (user.usageCount > limit) {
    const over = user.usageCount - limit;
    user.extraPages = Math.max((user.extraPages || 0) - over, 0);
  }

  await user.save();
  console.log(`✅ Usage incremented for ${plan} plan to ${user.usageCount}/${totalLimit}`);
  return true;
}


module.exports = { incrementUsage, PLAN_LIMITS };
