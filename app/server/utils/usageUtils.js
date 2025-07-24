// utils/usageUtils.js
function incrementUsage(user, isPreview, pages = 1, forcePlan = null) {
  const plan = (forcePlan || user.plan || "").toLowerCase();
  console.log(`🔍 incrementUsage called with plan="${plan}", isPreview=${isPreview}, pages=${pages}`);

  if (isPreview && plan === "free") {
    if (user.previewCount < 3) {
      user.previewCount++;
      console.log(`👀 Incremented preview count to ${user.previewCount}`);
    } else {
      user.usageCount += pages;
      console.log(`⚠️ Preview limit reached, usage +${pages}`);
    }
  } else if (["premium", "pro"].includes(plan)) {
    user.usageCount += pages;
    console.log(`🔥 Usage +${pages} for ${plan}, total: ${user.usageCount}`);
  } else if (!isPreview) {
    user.usageCount += pages;
    console.log(`💡 Non-preview: usage +${pages}, total: ${user.usageCount}`);
  } else {
    console.warn(`⚠️ Unknown plan or preview state — no usage increment.`);
  }
}

module.exports = { incrementUsage };
