const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    apiKey: {
      type: String,
      required: true,
      select: false, // Don't select by default
    },
    isPremium: {
      type: Boolean,
      default: false,
    },
    maxUsage: {
      type: Number,
      default: 30,
    },
    usageCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Methods to handle encryption and decryption
userSchema.methods.getDecryptedApiKey = function () {
  const decipher = crypto.createDecipher("aes-256-cbc", process.env.ENCRYPTION_SECRET);
  let decrypted = decipher.update(this.apiKey, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
};

// Pre-save hook to hash the password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const hashedPassword = await bcrypt.hash(this.password, 10);
    this.password = hashedPassword;
    next();
  } catch (error) {
    next(error);
  }
});

// Encrypt the API key before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("apiKey")) return next();

  const cipher = crypto.createCipher("aes-256-cbc", process.env.ENCRYPTION_SECRET);
  let encrypted = cipher.update(this.apiKey, "utf8", "hex");
  encrypted += cipher.final("hex");
  this.apiKey = encrypted;

  next();
});

module.exports = mongoose.model("User", userSchema);
