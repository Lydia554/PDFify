const express = require("express");
const router = express.Router();
const User = require("../models/User");
const authenticate = require("../middleware/authenticate");
const dualAuth = require("../middleware/dualAuth");
const fs = require("fs");
const path = require("path");

router.post("/generate-csv", authenticate, dualAuth, async (req, res) => {
  const { data } = req.body;
  log("Received data for CSV generation:", data);

  if (!data || typeof data !== "object") {
    log("Invalid or missing data:", data);
    return res.status(400).json({ error: "Invalid or missing data" });
  }

  const normalizedData = Array.isArray(data) ? data : [data];
  if (!normalizedData.length) {
    log("Empty data array");
    return res.status(400).json({ error: "Empty data" });
  }

  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      log("User not found:", req.user.userId);
      return res.status(404).json({ error: "User not found" });
    }


    const now = new Date();
    const lastReset = user.usageLastReset ? new Date(user.usageLastReset) : null;

    const resetNeeded =
      !lastReset ||
      now.getFullYear() > lastReset.getFullYear() ||
      now.getMonth() > lastReset.getMonth();

    if (resetNeeded) {
      console.log("🔄 Resetting usage count for user:", user._id);
      user.usageCount = 0;
      user.usageLastReset = now;
      await user.save();
    }
 

    const rowCount = normalizedData.length;

    if ((user.usageCount + rowCount) > user.maxUsage) {
      return res.status(403).json({
        error: "Monthly usage limit reached. Upgrade to premium for more downloads.",
      });
    }

    user.usageCount += rowCount;
    await user.save();
    log("User usage count updated:", user.usageCount);

    const keys = Object.keys(normalizedData[0]);
    const rows = normalizedData.map((row) =>
      keys.map((k) => JSON.stringify(row[k] ?? "")).join(",")
    );
    const header = keys.join(",");
    const csv = [header, ...rows].join("\n");

    const tempDir = path.join(__dirname, "../temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const tempCsvPath = path.join(tempDir, `data_${Date.now()}.csv`);

    fs.writeFileSync(tempCsvPath, csv);

    res.download(tempCsvPath, "data.csv", (err) => {
      if (err) console.error("Error sending CSV file:", err);
      fs.unlinkSync(tempCsvPath);
    });
  } catch (error) {
    console.error("CSV generation failed:", error);
    res.status(500).json({ error: "CSV generation failed" });
  }
});

module.exports = router;
