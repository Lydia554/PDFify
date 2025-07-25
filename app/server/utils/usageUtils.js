// utils/usageUtils.js
const User = require("../models/User");

async function incrementUsage(user, pages = 1, isPreview = false, forcePlan = null) {
  const plan = (forcePlan || user.plan || "").toLowerCase();
  console.log(`🔍 incrementUsage called with plan="${plan}", isPreview=${isPreview}, pages=${pages}`);

  // Free preview mode
  if (isPreview && plan === "free") {
    if (user.previewCount < 3) {
      user.previewCount++;
      await user.save();
      console.log(`👀 Incremented preview count to ${user.previewCount}`);
      return true;
    } else {
      await User.findByIdAndUpdate(user._id, { $inc: { usageCount: pages } });
      console.log(`⚠️ Preview limit reached, bumped usage by ${pages}`);
      return true;
    }
  }

  // Premium or Pro plans skip limit
  if (["premium", "pro"].includes(plan)) {
    await User.findByIdAndUpdate(user._id, { $inc: { usageCount: pages } });
    console.log(`🔥 Usage incremented for ${plan} plan by ${pages}`);
    return true;
  }

  // Free plan limits
  const now = new Date();
  const currentMonth = now.getMonth();
  const resetNeeded = !user.usageLastReset || new Date(user.usageLastReset).getMonth() !== currentMonth;

  if (resetNeeded) {
    user.usageCount = 0;
    user.usageLastReset = now;
    await user.save();
    console.log("🔄 Usage reset for new month");
  }

  if (user.usageCount + pages > user.maxUsage) {
    console.log("🚫 Usage limit exceeded for free plan");
    return false;
  }

  user.usageCount += pages;
  await user.save();
  console.log(`✅ Usage incremented to ${user.usageCount}`);
  return true;
}

module.exports = { incrementUsage };
