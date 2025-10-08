const PLAN_LIMITS = {
  free: 30,
  premium: 1000,
  pro: 10000
};

const PREVIEW_LIMITS = {
  free: 3,
  premium: 10,
  pro: 25
};

/**
 * Atomically increments usage for a user.
 * Handles previews, normal usage, extra pages, and monthly reset.
 */
async function incrementUsage(user, pages = 1, isPreview = false, forcePlan = null) {
  const plan = (forcePlan || user.planType || "free").toLowerCase();
  console.log(`🔍 incrementUsage called with plan="${plan}", isPreview=${isPreview}, pages=${pages}`);

  const now = new Date();

  // Reset monthly usage and preview count if needed
  const resetMonth = !user.usageLastReset || new Date(user.usageLastReset).getMonth() !== now.getMonth();
  if (resetMonth) {
    await user.constructor.findByIdAndUpdate(user._id, {
      usageCount: 0,
      previewCount: 0,
      usageLastReset: now
    });
    console.log("🔄 Usage and preview reset for new month");
  }

  if (isPreview) {
    const maxPreviews = PREVIEW_LIMITS[plan] || PREVIEW_LIMITS["free"];
    const previewCount = user.previewCount || 0;

    if (previewCount < maxPreviews) {
      // Atomic increment for preview
      await user.constructor.findByIdAndUpdate(user._id, { $inc: { previewCount: 1 } });
      console.log(`👀 Preview count incremented (atomic)`);
      return true;
    } else {
      console.log(`⚠️ Preview limit reached. Counting toward normal usage.`);
    }
  }

  // Normal usage: atomic increment
  const limit = PLAN_LIMITS[plan] || PLAN_LIMITS["free"];
  const totalLimit = limit + (user.extraPages || 0);

  // Reload latest usageCount from DB to avoid race conditions
  const freshUser = await user.constructor.findById(user._id);
  const currentUsage = freshUser.usageCount || 0;

  if (currentUsage + pages > totalLimit) {
    console.log(`🚫 Usage limit exceeded. Requested ${pages} pages.`);
    return false;
  }

  // Atomically increment usageCount
  const updated = await user.constructor.findByIdAndUpdate(
    user._id,
    { $inc: { usageCount: pages } },
    { new: true }
  );

  // Adjust extraPages if over limit
  if (updated.usageCount > limit) {
    const over = updated.usageCount - limit;
    updated.extraPages = Math.max((updated.extraPages || 0) - over, 0);
    await updated.save();
  }

  console.log(`✅ Usage incremented atomically for ${plan} plan to ${updated.usageCount}/${totalLimit}`);
  return true;
}

module.exports = { incrementUsage, PLAN_LIMITS, PREVIEW_LIMITS };
