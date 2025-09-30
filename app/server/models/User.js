const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const dotenv = require("dotenv");
dotenv.config();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY?.trim();
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
  throw new Error(`ENCRYPTION_KEY must be set in the .env file and must be 32 characters long. Current length: ${ENCRYPTION_KEY?.length}`);
}

const IV_LENGTH = 16;

// ----------------------------
// Encryption / Decryption
// ----------------------------
function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decrypt(text) {
  const textParts = text.split(":");
  if (textParts.length !== 2) throw new Error("Invalid encrypted text format");

  const iv = Buffer.from(textParts[0], "hex");
  const encryptedText = Buffer.from(textParts[1], "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString("utf8");
}

// ----------------------------
// User Schema
// ----------------------------
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // bcrypt only
  apiKey: { type: String, required: true, unique: true },

  connectedWooDomain: { type: String, required: false },
  wooConsumerKey: { type: String, required: false },
  wooConsumerSecret: { type: String, required: false },
  allowCustomerPDF: { type: Boolean, default: false },

  connectedShopDomain: { type: String, required: false },
  shopifyAccessToken: { type: String, required: false },

  stripeCustomerId: { type: String },
  stripeSubscriptionId: { type: String },
  planType: { type: String, enum: ["free", "premium", "pro"], default: "free" },

  usageCount: { type: Number, default: 0 },
  maxUsage: { type: Number, default: 30 },
  usageLastReset: { type: Date, default: Date.now },

  previewCount: { type: Number, default: 0 },
  previewLastReset: { type: Date, default: Date.now },

  isPremium: { type: Boolean, default: false },
  role: { type: String, enum: ["user", "admin"], default: "user" },
  isActive: { type: Boolean, default: true },

  deleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },

  cookieConsent: { type: Boolean, default: false },
  cookieConsentDate: { type: Date },

  resetToken: { type: String },
  resetTokenExpiry: { type: Date },

  extraPages: { type: Number, default: 0 },
}, { timestamps: true });

// ----------------------------
// Middleware
// ----------------------------
userSchema.pre("save", function (next) {
  if (this.connectedShopDomain) this.connectedShopDomain = this.connectedShopDomain.trim().toLowerCase();
  if (this.connectedWooDomain) this.connectedWooDomain = this.connectedWooDomain.trim().toLowerCase();
  next();
});

// Encrypt API key only
userSchema.pre("save", async function (next) {
  if (this.isModified("apiKey")) this.apiKey = encrypt(this.apiKey);
  next();
});

// Encrypt WooCommerce keys only
userSchema.pre("save", async function (next) {
  if (this.isModified("wooConsumerKey") && this.wooConsumerKey) this.wooConsumerKey = encrypt(this.wooConsumerKey);
  if (this.isModified("wooConsumerSecret") && this.wooConsumerSecret) this.wooConsumerSecret = encrypt(this.wooConsumerSecret);
  next();
});

// Hash password (bcrypt only)
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// ----------------------------
// Instance Methods
// ----------------------------
userSchema.methods.getDecryptedApiKey = function () {
  return decrypt(this.apiKey);
};

userSchema.methods.getDecryptedWooKeys = function () {
  if (!this.wooConsumerKey || !this.wooConsumerSecret) return null;
  return {
    key: decrypt(this.wooConsumerKey),
    secret: decrypt(this.wooConsumerSecret),
  };
};

module.exports = mongoose.model("User", userSchema);
