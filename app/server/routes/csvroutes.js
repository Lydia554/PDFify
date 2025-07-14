
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
    if (!user.csvUsageLastReset || now.getMonth() !== user.csvUsageLastReset.getMonth()) {
      user.csvUsageCount = 0;
      user.csvUsageLastReset = now;
    }

    user.csvUsageCount = (user.csvUsageCount || 0) + 1;
    console.log("📊 CSV usage incremented:", user.csvUsageCount);
    await user.save();

    const keys = Object.keys(normalizedData[0]);
    const rows = normalizedData.map(row =>
      keys.map(k => JSON.stringify(row[k] ?? "")).join(",")
    );
    const header = keys.join(",");
    const csv = [header, ...rows].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=data.csv");
    res.send(csv);
  } catch (err) {
    console.error("❌ CSV generation failed:", err);
    res.status(500).json({ error: "Failed to generate CSV" });
  }
});

module.exports = router;
