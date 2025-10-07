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

const User = require("../models/User");

async function incrementUsage(user, pages = 1, isPreview = false, forcePlan = null) {
  const plan = (forcePlan || user.planType || "free").toLowerCase();
  console.log(`🔍 incrementUsage called with plan="${plan}", isPreview=${isPreview}, pages=${pages}`);

  const now = new Date();
  if (!user.usageLastReset || new Date(user.usageLastReset).getMonth() !== now.getMonth()) {
    await User.findByIdAndUpdate(user._id, {
      usageCount: 0,
      previewCount: 0,
      usageLastReset: now
    });
    user.usageCount = 0;
    user.previewCount = 0;
    user.usageLastReset = now;
    console.log("🔄 Usage and preview reset for new month");
  }

  if (isPreview) {
    const maxPreviews = PREVIEW_LIMITS[plan] || PREVIEW_LIMITS.free;
    if ((user.previewCount || 0) < maxPreviews) {
      const updated = await User.findByIdAndUpdate(
        user._id,
        { $inc: { previewCount: 1 } },
        { new: true }
      );
      user.previewCount = updated.previewCount;
      console.log(`👀 Preview count incremented to ${user.previewCount}/${maxPreviews}`);
      return true;
    }
  }

  const limit = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  const totalLimit = limit + (user.extraPages || 0);

  // Load latest usage atomically from DB
  const updated = await User.findByIdAndUpdate(
    user._id,
    { $inc: { usageCount: pages } },
    { new: true }
  );

  // Deduct from extraPages if over plan limit
  if (updated.usageCount > limit) {
    const over = updated.usageCount - limit;
    const updatedExtra = await User.findByIdAndUpdate(
      user._id,
      { $inc: { extraPages: -over } },
      { new: true }
    );
    user.extraPages = updatedExtra.extraPages;
  }

  user.usageCount = updated.usageCount;
  console.log(`✅ Usage incremented for ${plan} plan to ${user.usageCount}/${totalLimit}`);
  return true;
}

module.exports = { incrementUsage, PLAN_LIMITS, PREVIEW_LIMITS };
