// usageUtils-wrapper.js
const { incrementUsage } = require("./usageUtils");

function incrementUsageLegacy(user, isPreview, pages = 1, forcePlan = null) {
  return incrementUsage(user, pages, isPreview, forcePlan);
}

module.exports = { incrementUsage, incrementUsageLegacy };
