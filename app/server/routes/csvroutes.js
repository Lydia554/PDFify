const express = require("express");
const router = express.Router();
const User = require("../models/User");
const authenticate = require("../middleware/authenticate");
const dualAuth = require("../middleware/dualAuth");

router.post("/generate-csv", authenticate, dualAuth, async (req, res) => {
  console.log("📄 /generate-csv router hit");

  const { data } = req.body;

  if (!data || typeof data !== "object") {
    return res.status(400).json({ error: "Invalid or missing data" });
  }

  const normalizedData = Array.isArray(data) ? data : [data];
  if (!normalizedData.length) {
    return res.status(400).json({ error: "Empty data" });
  }

  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const now = new Date();

    // Reset CSV usage count monthly
    if (!user.csvUsageLastReset || now.getMonth() !== user.csvUsageLastReset.getMonth()) {
      user.csvUsageCount = 0;
      user.csvUsageLastReset = now;
    }

    // Determine user plan type
    const isPro = user.isPremium || user.planType === "pro";
    const isBasic = !isPro;

    // Set CSV usage limit for basic users
    const csvMonthlyLimit = 30;

    // Enforce limit for basic users
    if (isBasic && user.csvUsageCount >= csvMonthlyLimit) {
      console.log("🚫 CSV usage limit reached for user:", user._id);
      return res.status(403).json({ error: "CSV usage limit reached for your plan." });
    }

    // Increment CSV usage count
    user.csvUsageCount = (user.csvUsageCount || 0) + 1;
    console.log(`📊 CSV usage incremented: ${user.csvUsageCount} for user ${user._id}`);
    await user.save();

    // Generate CSV content
    const keys = Object.keys(normalizedData[0]);
    const rows = normalizedData.map(row =>
      keys.map(k => JSON.stringify(row[k] ?? "")).join(",")
    );
    const header = keys.join(",");
    const csv = [header, ...rows].join("\n");

    // Send CSV as downloadable file
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=data.csv");
    res.send(csv);

  } catch (err) {
    console.error("❌ CSV generation failed:", err);
    res.status(500).json({ error: "Failed to generate CSV" });
  }
});

module.exports = router;
