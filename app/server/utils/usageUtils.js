const User = require("../models/User");

const PLAN_LIMITS = {
  free: 30,        // Free users: 30 pages/month
  premium: 1000,   // Premium users: 1,000 pages/month
  pro: 10000       // Pro users: 10,000 pages/month
};

async function incrementUsage(user, pages = 1, isPreview = false, forcePlan = null) {
  const plan = (forcePlan || user.plan || "free").toLowerCase();
  console.log(`🔍 incrementUsage called with plan="${plan}", isPreview=${isPreview}, pages=${pages}`);

  // Reset monthly usage if needed
  const now = new Date();
  const currentMonth = now.getMonth();
  if (!user.usageLastReset || new Date(user.usageLastReset).getMonth() !== currentMonth) {
    user.usageCount = 0;
    user.usageLastReset = now;
    await user.save();
    console.log("🔄 Usage reset for new month");
  }

  // Preview counts for free plan (doesn't consume quota until limit)
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

  // Determine plan limits
  const limit = PLAN_LIMITS[plan] || PLAN_LIMITS["free"];

  // Check if this increment would exceed plan limit
  if (user.usageCount + pages > limit) {
    console.log(`🚫 Usage limit exceeded for ${plan} plan. Requested ${pages} pages.`);
    return false;
  }

  // Increment usage
  user.usageCount += pages;
  await user.save();
  console.log(`✅ Usage incremented for ${plan} plan to ${user.usageCount}/${limit}`);
  return true;
}

module.exports = { incrementUsage, PLAN_LIMITS };
