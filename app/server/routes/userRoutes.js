const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const User = require("../models/User");
const authenticate = require("../middleware/authenticate");
const dualAuth = require("../middleware/dualAuth");
const sendEmail = require("../sendEmail");

const router = express.Router();

const log = (message, data = null) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(message, data);
  }
};

router.post("/user-creation", async (req, res) => {
  const { email, password, cookieConsent } = req.body;

  try {
    let user = await User.findOne({ email });

    if (user) {
      if (!user.deleted) {
        return res.status(400).json({ error: "User already exists" });
      }

      const deletedAt = user.deletedAt || new Date(0);
      const now = new Date();
      const hoursSinceDeleted = (now - deletedAt) / (1000 * 60 * 60);

      if (hoursSinceDeleted < 24) {
        const remaining = Math.ceil(24 - hoursSinceDeleted);
        return res.status(403).json({
          error: `You must wait ${remaining} more hour(s) before you can reactivate this account.`,
        });
      }

      const newApiKey = crypto.randomBytes(24).toString("hex");
      const hashedPassword = await bcrypt.hash(password, 10);

      user.password = hashedPassword;
      user.apiKey = newApiKey;
      user.deleted = false;
      user.deletedAt = null;
      user.cookieConsent = cookieConsent || false;
      user.cookieConsentDate = cookieConsent ? new Date() : undefined;

      await user.save();

      req.session.userId = user._id;

      await sendEmail({
        to: email,
        subject: "Welcome back to PDFify!",
        text: `Hi ${email},\n\nThis account was previously deleted. It has now been restored. Your new API key is: ${newApiKey}\n\nWelcome back!\n\nPDFify Team`
      });

      return res.status(200).json({
        message: "This account was previously deleted. Restoring...",
        redirect: "/login.html",
      });
    }

    // Create new user
    const hashedPassword = await bcrypt.hash(password, 10);
    const apiKey = crypto.randomBytes(24).toString("hex");

    const newUser = await User.create({
      email,
      password: hashedPassword,
      apiKey,
      cookieConsent: cookieConsent || false,
      cookieConsentDate: cookieConsent ? new Date() : undefined,
    });

    req.session.userId = newUser._id;

    await sendEmail({
      to: email,
      subject: "Welcome to PDFify!",
      text: `Hi ${email},\n\nThank you for signing up! Your API key is: ${apiKey}\n\nEnjoy!\n\nThe PDFify Team`
    });

    res.status(201).json({ message: "User created", redirect: "/login.html" });

  } catch (error) {
    console.error("User creation error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/consent", authenticate, dualAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    await User.findByIdAndUpdate(userId, {
      cookieConsent: true,
      cookieConsentDate: new Date(),
    });

    res.json({ message: "Consent saved" });
  } catch (err) {
    res.status(500).json({ error: "Failed to save consent" });
  }
});

router.get("/usage", authenticate, dualAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      email: user.email,
      apiKey: user.apiKey,
      usageCount: user.usageCount,
      maxUsage: user.maxUsage,
      planType: user.planType || "Free",
    });
  } catch (error) {
    console.error("Error in /usage route:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/me", authenticate, dualAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    log("Fetched user details:", user);

    res.json({
      email: user.email,
      apiKey: user.apiKey,
      usageCount: user.usageCount,
      maxUsage: user.maxUsage,
      isPremium: user.isPremium,
      planType: user.planType || "Free",
    });
  } catch (error) {
    console.error("Error fetching user details:", error);
    res.status(500).json({ error: "Error fetching user details" });
  }
});

router.put("/update", authenticate, dualAuth, async (req, res) => {
  const { email, password } = req.body;
  const userId = req.user.userId;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    let emailChanged = false;

    if (email && email !== user.email) {
      user.email = email;
      emailChanged = true;
    }

    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }

    await user.save();

    log("User details updated successfully:", user);

    if (emailChanged || password) {
      await sendEmail({
        to: user.email,
        subject: "Your Account Information Has Been Updated",
        text: `Hi ${user.email},\n\nYour account information has been updated. If you did not make this change, please contact support immediately.\n\nBest regards,\nThe PDFify Team`,
      });

      log("Update notification email sent to:", user.email);
    }

    res.json({ message: "User details updated successfully!" });
  } catch (error) {
    console.error("Error updating user information:", error);
    res.status(500).json({ error: "Error updating user information" });
  }
});

router.delete("/delete", authenticate, dualAuth, async (req, res) => {
  const userId = req.user.userId;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.deleted = true;
    user.deletedAt = new Date();
    await user.save();

    log("User marked as deleted:", user.email);

    res.json({ message: "Account deleted successfully!" });
  } catch (error) {
    console.error("Account delete error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
