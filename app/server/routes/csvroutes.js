router.post("/generate-csv", authenticate, dualAuth, async (req, res) => {
  console.log("CSV generation request received");
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
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    console.log("User before usage update:", user);

    const now = new Date();
    const lastReset = user.usageLastReset ? new Date(user.usageLastReset) : null;

    const resetNeeded =
      !lastReset ||
      now.getFullYear() > lastReset.getFullYear() ||
      now.getMonth() > lastReset.getMonth();

    if (resetNeeded) {
      console.log("Resetting usage count");
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

    console.log("User after usage update:", user);
 


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
  } 

     catch (error) {
    console.error("CSV generation failed:", error);
    res.status(500).json({ error: "CSV generation failed" });
  }
});

module.exports = router;
