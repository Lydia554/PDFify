const crypto = require("crypto");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // 32 bytes
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
  throw new Error("ENCRYPTION_KEY must be set in the .env file and must be 32 characters long.");
}

const IV_LENGTH = 16; // AES block size

// Encrypt text
function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

// Decrypt text
function decrypt(text) {
  const textParts = text.split(":");
  if (textParts.length !== 2) {
    throw new Error("Invalid encrypted text format");
  }

  const iv = Buffer.from(textParts[0], "hex");
  const encryptedText = Buffer.from(textParts[1], "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString("utf8");
}

// User Schema
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  apiKey: { type: String, required: true },
  usageCount: { type: Number, default: 0 },
  maxUsage: { type: Number, default: 30 },
  isPremium: { type: Boolean, default: false },
});

// Create API Key if not present and encrypt it
userSchema.pre("save", async function (next) {
  if (!this.apiKey) {
    // If no API key is provided, generate one
    this.apiKey = crypto.randomBytes(32).toString("hex");
  }
  
  // Encrypt the API key before saving to the DB
  if (this.isModified("apiKey")) {
    this.apiKey = encrypt(this.apiKey);
  }

  // Hash password only when it's new
  if (this.isModified("password")) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }

  next();
});

// Method to compare password with hash
userSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

// Method to get decrypted API Key
userSchema.methods.getDecryptedApiKey = function () {
  return decrypt(this.apiKey);
};

// Method to change password (hash and save)
userSchema.methods.changePassword = async function (newPassword) {
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(newPassword, salt);
  await this.save(); // Save the updated password
};

// Method to change API Key (generate new key and encrypt)
userSchema.methods.changeApiKey = async function () {
  const newApiKey = crypto.randomBytes(32).toString("hex");
  this.apiKey = encrypt(newApiKey);
  await this.save(); // Save the updated API key
};

module.exports = mongoose.model("User", userSchema);
