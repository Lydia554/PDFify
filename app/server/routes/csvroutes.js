const express = require("express");
const router = express.Router();
const User = require("../models/User");
const authenticate = require("../middleware/authenticate");
const dualAuth = require("../middleware/dualAuth");
const fs = require("fs");
const path = require("path");

// Simple logger helper
function log(...args) {
  console.log("[generate-csv]", ...args);
}

router.post("/generate-csv", authenticate, dualAuth, async (req, res) => {
  log("CSV generation request received");

  const { data } = req.body;

  if (!data || typeof data !== "object") {
    log("Invalid or missing data:", data);
    return res.status(400).json({ error: "Invalid or missing data" });
  }

  const normalizedData = Array.isArray(data) ? data : [data];
  if (normalizedData.length === 0) {
    log("Empty data array");
    return res.status(400).json({ error: "Empty data" });
  }

  try {
    // Re-fetch user fresh from DB to ensure full Mongoose doc, or rely on req.fullUser if confident it's fresh
    let user = req.fullUser;

    // Optionally, re-fetch to be 100% sure:
    user = await User.findById(user._id);
    if (!user) {
      log("User not found by ID:", req.fullUser._id);
      return res.status(404).json({ error: "User not found" });
    }

    log("User before usage update:", {
      id: user._id.toString(),
      usageCount: user.usageCount,
      maxUsage: user.maxUsage,
      usageLastReset: user.usageLastReset,
    });

    // Monthly usage reset logic
    const now = new Date();
    const lastReset = user.usageLastReset ? new Date(user.usageLastReset) : null;
    const resetNeeded =
      !lastReset ||
      now.getFullYear() > lastReset.getFullYear() ||
      now.getMonth() > lastReset.getMonth();

    if (resetNeeded) {
      log("Resetting usage count for user:", user._id.toString());
      user.usageCount = 0;
      user.usageLastReset = now;
      await user.save();
      log("Usage count reset and saved");
    }

    const rowCount = normalizedData.length;
    if (user.usageCount + rowCount > user.maxUsage) {
      log(
        `Usage limit exceeded: current ${user.usageCount} + ${rowCount} > max ${user.maxUsage}`
      );
      return res.status(403).json({
        error: "Monthly usage limit reached. Upgrade to premium for more downloads.",
      });
    }

    // Increment usageCount
    user.usageCount += rowCount;

    // Save updated user usageCount
    try {
      await user.save();
      log("Updated usageCount saved:", user.usageCount);
    } catch (saveErr) {
      log("Error saving updated usageCount:", saveErr);
      return res.status(500).json({ error: "Failed to update usage count" });
    }

    // Prepare CSV content
    const keys = Object.keys(normalizedData[0]);
    const rows = normalizedData.map((row) =>
      keys.map((k) => JSON.stringify(row[k] ?? "")).join(",")
    );
    const header = keys.join(",");
    const csv = [header, ...rows].join("\n");

    // Ensure temp directory exists
    const tempDir = path.join(__dirname, "../temp");
    if (!fs.existsSync(tempDir)) {
      log("Creating temp directory:", tempDir);
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempCsvPath = path.join(tempDir, `data_${Date.now()}.csv`);
    log("Writing CSV to:", tempCsvPath);
    fs.writeFileSync(tempCsvPath, csv);

    // Send CSV file and cleanup
    log("Sending CSV file to client");
    res.download(tempCsvPath, "data.csv", (err) => {
      if (err) {
        log("Error sending CSV file:", err);
        // No response here, headers already sent
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
