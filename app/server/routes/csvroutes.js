const express = require("express");
const router = express.Router();
const User = require("../models/User");
const authenticate = require("../middleware/authenticate");
const dualAuth = require("../middleware/dualAuth");
const fs = require("fs");
const path = require("path");

// Simple logger helper for consistent logs
function log(...args) {
  console.log("[generate-csv]", ...args);
}

router.post("/generate-csv", authenticate, dualAuth, async (req, res) => {
  log("CSV generation request received");

  const { data } = req.body;
  log("Received data:", data);

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
    log("Looking up user by ID:", req.user.userId);
    const user = await User.findById(req.user.userId);
    if (!user) {
      log("User not found with ID:", req.user.userId);
      return res.status(404).json({ error: "User not found" });
    }
    log("User found:", {
      id: user._id,
      usageCount: user.usageCount,
      maxUsage: user.maxUsage,
      usageLastReset: user.usageLastReset,
    });

    const now = new Date();
    const lastReset = user.usageLastReset ? new Date(user.usageLastReset) : null;
    log("Current time:", now);
    log("Last usage reset:", lastReset);

    const resetNeeded =
      !lastReset ||
      now.getFullYear() > lastReset.getFullYear() ||
      now.getMonth() > lastReset.getMonth();

    if (resetNeeded) {
      log("Resetting usage count for user:", user._id);
      user.usageCount = 0;
      user.usageLastReset = now;
      await user.save();
      log("Usage count reset to 0 and saved");
    }

    const rowCount = normalizedData.length;
    log("Number of rows to add to usageCount:", rowCount);
    log("Current usageCount before update:", user.usageCount);

    if ((user.usageCount + rowCount) > user.maxUsage) {
      log(
        "Usage limit exceeded:",
        user.usageCount,
        "+",
        rowCount,
        ">",
        user.maxUsage
      );
      return res.status(403).json({
        error: "Monthly usage limit reached. Upgrade to premium for more downloads.",
      });
    }

    user.usageCount += rowCount;
    await user.save();
    log("Updated usageCount saved:", user.usageCount);

    // Prepare CSV content
    const keys = Object.keys(normalizedData[0]);
    const rows = normalizedData.map((row) =>
      keys.map((k) => JSON.stringify(row[k] ?? "")).join(",")
    );
    const header = keys.join(",");
    const csv = [header, ...rows].join("\n");

    // Prepare temp directory and file path
    const tempDir = path.join(__dirname, "../temp");
    if (!fs.existsSync(tempDir)) {
      log("Temp directory does not exist. Creating:", tempDir);
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempCsvPath = path.join(tempDir, `data_${Date.now()}.csv`);
    log("Writing CSV file to:", tempCsvPath);

    fs.writeFileSync(tempCsvPath, csv);

    log("Sending CSV file to client");
    res.download(tempCsvPath, "data.csv", (err) => {
      if (err) {
        log("Error sending CSV file:", err);
      }
      try {
        fs.unlinkSync(tempCsvPath);
        log("Temporary CSV file deleted");
      } catch (unlinkErr) {
        log("Failed to delete temp CSV file:", unlinkErr);
      }
    });
  } catch (error) {
    log("CSV generation failed:", error);
    res.status(500).json({ error: "CSV generation failed" });
  }
});

module.exports = router;
