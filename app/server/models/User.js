const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const dotenv = require("dotenv");
dotenv.config();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
  throw new Error("ENCRYPTION_KEY must be set in the .env file and must be 32 characters long.");
}

const IV_LENGTH = 16;

function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

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

// Encrypt API Key before saving
userSchema.pre('save', async function (next) {
  if (this.isModified('apiKey')) {
    this.apiKey = await encryptApiKey(this.apiKey);
  }

  if (this.isNew) {
    // Hash the password only when a new user is created
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

// Helper to encrypt the API Key
const encryptApiKey = async (apiKey) => {
  const cipher = crypto.createCipher('aes-256-cbc', process.env.API_KEY_SECRET);
  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
};

// Helper to decrypt the API Key
userSchema.methods.getDecryptedApiKey = function () {
  const decipher = crypto.createDecipher('aes-256-cbc', process.env.API_KEY_SECRET);
  let decrypted = decipher.update(this.apiKey, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

// Method to update password (re-hash it)
userSchema.methods.updatePassword = async function (newPassword) {
  this.password = await bcrypt.hash(newPassword, 10);
  await this.save();
};

module.exports = mongoose.model('User', userSchema);