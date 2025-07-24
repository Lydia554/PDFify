// utils/usageUtils.js
const User = require("../models/User"); 

async function incrementUsage(user, isPreview, pages = 1, forcePlan = null) {
  const plan = (forcePlan || user.plan || "").toLowerCase();
  console.log(`🔍 incrementUsage called with plan="${plan}", isPreview=${isPreview}, pages=${pages}`);

  if (isPreview && plan === "free") {
    if (user.previewCount < 3) {
      user.previewCount++;
      await user.save(); 
      console.log(`👀 Incremented preview count to ${user.previewCount}`);
    } else {
      
      await User.findByIdAndUpdate(user._id, { $inc: { usageCount: pages } });
      console.log(`⚠️ Preview limit reached, bumped usage by ${pages}`);
    }
  } else if (["premium", "pro"].includes(plan) || !isPreview) {
    await User.findByIdAndUpdate(user._id, { $inc: { usageCount: pages } });
    console.log(`🔥 Usage incremented for ${plan || "free"} plan by ${pages}`);
  } else {
    console.warn(`⚠️ Unknown plan or preview state — no usage increment.`);
  }
}

module.exports = { incrementUsage };
