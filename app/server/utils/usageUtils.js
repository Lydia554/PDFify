

const PLAN_LIMITS = {
  free: 30,        // Free users: 30 pages/month
  premium: 1000,   // Premium users: 1,000 pages/month
  pro: 10000       // Pro users: 10,000 pages/month
};

const PREVIEW_LIMITS = {
  free: 3,
  premium: 10,
  pro: 25
};

async function incrementUsage(user, pages = 1, isPreview = false, forcePlan = null) {
  const plan = (forcePlan || user.planType || "free").toLowerCase();
  console.log(`🔍 incrementUsage called with plan="${plan}", isPreview=${isPreview}, pages=${pages}`);

  // Reset monthly usage and preview count if needed
  const now = new Date();
  if (!user.usageLastReset || new Date(user.usageLastReset).getMonth() !== now.getMonth()) {
    user.usageCount = 0;
    user.previewCount = 0;
    user.usageLastReset = now;
    await user.save();
    console.log("🔄 Usage and preview reset for new month");
  }

  if (isPreview) {
    const maxPreviews = PREVIEW_LIMITS[plan] || PREVIEW_LIMITS["free"];
    user.previewCount = user.previewCount || 0;

    if (user.previewCount < maxPreviews) {
      
      user.previewCount++;
      await user.save();
      console.log(`👀 Preview count incremented to ${user.previewCount}/${maxPreviews} (no usage deducted)`);
      return true;
    } else {
      console.log(`⚠️ Preview limit reached for ${plan} plan. Counting toward normal usage.`);
      
    }
  }

  // Normal page usage
  const limit = PLAN_LIMITS[plan] || PLAN_LIMITS["free"];
  const totalLimit = limit + (user.extraPages || 0);

  if (user.usageCount + pages > totalLimit) {
    console.log(`🚫 Usage limit exceeded for ${plan} plan. Requested ${pages} pages.`);
    return false;
  }

  user.usageCount += pages;

  // Deduct from extraPages if over plan limit
  if (user.usageCount > limit) {
    const over = user.usageCount - limit;
    user.extraPages = Math.max((user.extraPages || 0) - over, 0);
  }

  await user.save();
  console.log(`✅ Usage incremented for ${plan} plan to ${user.usageCount}/${totalLimit}`);
  return true;
}

module.exports = { incrementUsage, PLAN_LIMITS, PREVIEW_LIMITS };
