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
const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    apiKey: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    connectedShopDomain: { type: String, required: false },
    shopifyAccessToken: { type: String, required: false },
    usageCount: { type: Number, default: 0 },
    maxUsage: { type: Number, default: 30 },
    isPremium: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    isActive: { type: Boolean, default: true },
    resetToken: { type: String },
    resetTokenExpiry: { type: Date },

    previewCount: { type: Number, default: 0 },
    previewLastReset: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

userSchema.pre("save", function (next) {
  if (this.connectedShopDomain) {
    this.connectedShopDomain = this.connectedShopDomain.trim().toLowerCase();
  }
  next();
});



userSchema.pre("save", async function (next) {
  if (this.isModified("apiKey")) {
    this.apiKey = encrypt(this.apiKey);
  }
  next();
});


userSchema.methods.getDecryptedApiKey = function () {
  return decrypt(this.apiKey);
};

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model("User", userSchema);