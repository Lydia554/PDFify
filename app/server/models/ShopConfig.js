const mongoose = require("mongoose");

const ShopConfigSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, unique: true },
  customLogoUrl: String,
  showChart: { type: Boolean, default: false },
  theme: { type: String, default: "basic" },
  isPremium: { type: Boolean, default: false },

  allowCustomerPDF: { type: Boolean, default: false },

  // Bank details for invoices
  iban: { type: String, default: "" },
  bic: { type: String, default: "" },

  // OAuth/App Store fields
  isActive: { type: Boolean, default: true },
  connectedAt: { type: Date },
  uninstalledAt: { type: Date },

  // Branding settings
  primaryColor: { type: String, default: "#00a6cc" },
  companyName: { type: String, default: "" },
  bankName: { type: String, default: "" },

  // Usage tracking
  usageCount: { type: Number, default: 0 },
});

module.exports = mongoose.model("ShopConfig", ShopConfigSchema);
