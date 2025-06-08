const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const crypto = require("crypto");
const sendEmail = require("../sendEmail");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;


const log = (message, data = null) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(message, data);
  }
};

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid password" });
    }

    res.json({ apiKey: user.getDecryptedApiKey() });
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


router.post("/connect-shopify", authenticate, async (req, res) => {
  const { connectedShopDomain, shopifyAccessToken } = req.body;
  const userId = req.user._id; // Assuming your `authenticate` middleware attaches user info to req.user

  if (!connectedShopDomain || !shopifyAccessToken) {
    return res.status(400).json({ error: "Missing Shopify domain or access token" });
  }

  try {
    const normalizedDomain = connectedShopDomain.trim().toLowerCase();

    if (!normalizedDomain.endsWith(".myshopify.com")) {
      return res.status(400).json({ error: "Invalid Shopify domain" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.connectedShopDomain = normalizedDomain;
    user.shopifyAccessToken = shopifyAccessToken; // You may want to encrypt this token
    await user.save();

    console.log("✅ Shopify info updated for user:", user.email);

    res.json({ message: "Shopify info saved successfully" });
  } catch (error) {
    console.error("Error updating Shopify info:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).send("User not found");

    const token = crypto.randomBytes(32).toString("hex");
    user.resetToken = token;
    user.resetTokenExpiry = Date.now() + 1000 * 60 * 60; 

    await user.save();

    const resetUrl = `${process.env.BASE_URL}/reset-password.html?token=${token}`;
    await sendEmail({
      to: user.email,
      subject: "Reset your password",
      text: `Reset your password using this link: ${resetUrl}`,
    });

    res.send("Reset link sent to email");
  } catch (error) {
    console.error("Error in forgot-password route:", error);
    res.status(500).send("Server error");
  }
});



router.post("/reset-password/:token", async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  try {
    const user = await User.findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).send("Invalid or expired token");
    }

    log("New password before saving:", password);

    user.password = password;
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;

    await user.save();
    log("Password reset successful for user:", user.email);

    res.send("Password reset successful");
  } catch (error) {
    console.error("Error in reset-password route:", error);
    res.status(500).send("Server error");
  }
});

router.get("/verify-token", async (req, res) => {
  const token = req.headers["authorization"]?.split(" ")[1];

  if (!token) {
    return res.status(403).json({ error: "Token not provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ message: "Token is valid", userId: decoded.userId });
  } catch (error) {
    console.error("Error verifying token:", error);
    res.status(401).json({ error: "Invalid or expired token" });
  }
});

module.exports = router;