// utils/usageUtils.js
function incrementUsage(user, isPreview, pages = 1, forcePlan = null) {
  const plan = (forcePlan || user.plan || "").toLowerCase();
  console.log(`🔍 incrementUsage called with plan="${plan}", isPreview=${isPreview}, pages=${pages}`);

  if (isPreview && plan === "free") {
    if (user.previewCount < 3) {
      user.previewCount++;
      console.log(`👀 Incremented preview count to ${user.previewCount}`);
    } else {
      // usageCount increment handled atomically outside
      console.log(`⚠️ Preview limit reached, usage should increment outside`);
    }
  } else if (["premium", "pro"].includes(plan)) {
    // usageCount increment handled atomically outside
    console.log(`🔥 Usage increment should happen outside for ${plan}`);
  } else if (!isPreview) {
    // usageCount increment handled atomically outside
    console.log(`💡 Usage increment should happen outside for non-preview`);
  } else {
    console.warn(`⚠️ Unknown plan or preview state — no usage increment.`);
  }
}


module.exports = { incrementUsage };
