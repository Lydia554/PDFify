const express = require("express");
const router = express.Router();
const User = require("../models/User");
const authenticate = require("../middleware/authenticate");
const dualAuth = require("../middleware/dualAuth");

router.post("/generate-csv", authenticate, dualAuth, async (req, res) => {
  console.log("📄 /generate-csv route hit");

  const { data } = req.body;

  if (!data || typeof data !== "object") {
    console.warn("⚠️ Invalid or missing data in request body");
    return res.status(400).json({ error: "Invalid or missing data" });
  }

  const normalizedData = Array.isArray(data) ? data : [data];
  if (!normalizedData.length) {
    console.warn("⚠️ Empty data array");
    return res.status(400).json({ error: "Empty data" });
  }

  try {
    const userId = req.user?.userId;
    console.log("🔐 Authenticated userId:", userId);

    const user = await User.findById(userId);
    if (!user) {
      console.error("❌ User not found");
      return res.status(404).json({ error: "User not found" });
    }

    const now = new Date();

    const resetNeeded =
      !user.usageLastReset ||
      now.getFullYear() !== user.usageLastReset.getFullYear() ||
      now.getMonth() !== user.usageLastReset.getMonth();

    if (resetNeeded) {
      console.log("🔄 Resetting CSV usage count for user:", user._id);
      user.usageCount = 0;
      user.usageLastReset = now;
    }

    const isPro = user.isPremium || user.planType === "pro";
    const csvMonthlyLimit = 30;

    if (!isPro && user.usageCount >= csvMonthlyLimit) {
      console.log(`🚫 CSV usage limit reached for user ${user.email}`);
      return res.status(403).json({ error: "CSV usage limit reached." });
    }

    user.usageCount += 1;
    console.log(`📊 CSV usage incremented: ${user.usageCount} for user ${user._id}`);

    await user.save();
    console.log("💾 Saved user CSV usage successfully:", user.usageCount);

    // Generate CSV
    const keys = Object.keys(normalizedData[0]);
    const rows = normalizedData.map((row) =>
      keys.map((k) => JSON.stringify(row[k] ?? "")).join(",")
    );
    const header = keys.join(",");
    const csv = [header, ...rows].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=data.csv");
    res.send(csv);

  } catch (err) {
    console.error("❌ CSV generation error:", err);
    res.status(500).json({ error: "Failed to generate CSV" });
  }
});

module.exports = router;
