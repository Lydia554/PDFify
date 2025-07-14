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
    const user = await User.findById(req.user.userId);
    if (!user) {
      console.error("❌ User not found");
      return res.status(404).json({ error: "User not found" });
    }

    const now = new Date();
    const lastResetDate = user.usageLastReset ? new Date(user.usageLastReset) : null;

    const resetNeeded =
      !lastResetDate ||
      now.getFullYear() !== lastResetDate.getFullYear() ||
      now.getMonth() !== lastResetDate.getMonth();

    if (resetNeeded) {
      console.log("🔄 Resetting usage count for user:", user._id);
      user.usageCount = 0;
      user.usageLastReset = now;
      await user.save();
    }

 
    const monthlyLimit = user.monthlyLimit ?? 30; 

    const isPro = user.isPremium || user.planType === "pro";

    if (!isPro && user.usageCount >= monthlyLimit) {
      console.log(`🚫 Monthly usage limit reached for user ${user.email}`);
      return res.status(403).json({ error: "Monthly usage limit reached." });
    }

    user.usageCount++;
    await user.save();

    console.log(`📊 Usage incremented: ${user.usageCount} for user ${user._id}`);

 
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
