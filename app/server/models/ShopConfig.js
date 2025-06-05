// models/ShopConfig.js
const mongoose = require("mongoose");

const ShopConfigSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, unique: true },
  customLogoUrl: String,
  showChart: { type: Boolean, default: false },
  theme: { type: String, default: "basic" },
  isPremium: { type: Boolean, default: false }
});

module.exports = mongoose.model("ShopConfig", ShopConfigSchema);
