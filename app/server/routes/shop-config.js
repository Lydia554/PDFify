const express = require("express");
const router = express.Router();
const ShopConfig = require("../models/ShopConfig");
const { authMiddleware } = require("../middleware/authenticate"); 

// Get bank details for current shop
router.get("/shop-config", authMiddleware, async (req, res) => {
  try {
    const shopDomain = req.user.shopDomain; 
    const config = await ShopConfig.findOne({ shopDomain });
    if (!config) return res.status(404).json({ error: "Shop config not found" });

    res.json({ iban: config.iban, bic: config.bic });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Update bank details for current shop
router.put("/shop-config/update", authMiddleware, async (req, res) => {
  try {
    const { iban, bic } = req.body;
    const shopDomain = req.user.shopDomain;

    const config = await ShopConfig.findOneAndUpdate(
      { shopDomain },
      { iban, bic },
      { new: true, upsert: true }
    );

    res.json({ message: "Bank details updated successfully", config });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update bank details" });
  }
});

module.exports = router;
