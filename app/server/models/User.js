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

// Function to encrypt the API key
function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH); // Generate a random initialization vector
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv); // Create cipher instance
  let encrypted = cipher.update(text, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex"); // Return IV + encrypted text
}

// Function to decrypt the API key
function decrypt(text) {
  const textParts = text.split(":");
  if (textParts.length !== 2) {
    throw new Error("Invalid encrypted text format");
  }

  const iv = Buffer.from(textParts[0], "hex"); // Extract IV
  const encryptedText = Buffer.from(textParts[1], "hex"); // Extract encrypted data
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv); // Create decipher instance
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString("utf8"); // Return decrypted data
}

// User Schema
const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    apiKey: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    usageCount: { type: Number, default: 0 },
    maxUsage: { type: Number, default: 30 },
    isPremium: { type: Boolean, default: false },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    isActive: { type: Boolean, default: true },
    resetToken: { type: String },
    resetTokenExpiry: { type: Date },
  },
  { timestamps: true }
);

// Encrypt API key before saving
userSchema.pre("save", async function (next) {
  if (this.isModified("apiKey")) {
    this.apiKey = encrypt(this.apiKey); // Encrypt API key if it's modified
  }
  next();
});

// Decrypt API key
userSchema.methods.getDecryptedApiKey = function () {
  return decrypt(this.apiKey); // Decrypt API key when needed
};

// Hash password before saving (if it's modified)
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10); // Generate salt for password hashing
    this.password = await bcrypt.hash(this.password, salt); // Hash the password
    next();
  } catch (error) {
    next(error);
  }
});

// Compare provided password with the hashed password
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password); // Compare hashed password with entered password
};

module.exports = mongoose.model("User", userSchema);
