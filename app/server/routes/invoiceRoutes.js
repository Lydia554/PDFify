const express = require("express");
const router = express.Router();
const User = require("../models/User");
const authenticate = require("../middleware/authenticate");
const dualAuth = require("../middleware/dualAuth");

router.post("/generate-csv", authenticate, dualAuth, async (req, res) => {
  console.log("📄 /generate-csv router hit");

  try {
    const { data } = req.body;

    if (!data || typeof data !== "object") {
      return res.status(400).json({ error: "Invalid or missing data" });
    }

    const normalizedData = Array.isArray(data) ? data : [data];
    if (!normalizedData.length) {
      return res.status(400).json({ error: "Empty data" });
    }

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const now = new Date();

    // Monthly usage reset for CSV usage
    if (!user.csvUsageLastReset || now.getMonth() !== user.csvUsageLastReset.getMonth()) {
      console.log("🔄 Resetting CSV usage count for user:", user._id);
      user.csvUsageCount = 0;
      user.csvUsageLastReset = now;
    }

    // Determine user plan
    const isPro = user.isPremium || user.planType === "pro";
    const isBasic = !isPro;

    // CSV limit for basic users
    const csvMonthlyLimit = 10;

    if (isBasic && user.csvUsageCount >= csvMonthlyLimit) {
      console.log("🚫 CSV usage limit reached for user:", user._id);
      return res.status(403).json({ error: "CSV usage limit reached for your plan." });
    }

    // Increment usage count
    user.csvUsageCount = (user.csvUsageCount || 0) + 1;
    await user.save();
    console.log(`📊 CSV usage incremented: ${user.csvUsageCount} for user ${user._id}`);

    // Generate CSV content
    const keys = Object.keys(normalizedData[0]);
    const rows = normalizedData.map(row =>
      keys.map(k => JSON.stringify(row[k] ?? "")).join(",")
    );
    const header = keys.join(",");
    const csvContent = [header, ...rows].join("\n");

    // Send CSV file
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=data.csv");
    res.send(csvContent);

  } catch (error) {
    console.error("❌ Error generating CSV:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
