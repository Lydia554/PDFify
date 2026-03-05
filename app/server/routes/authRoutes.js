const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");;
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


router.get("/verify-email", async (req, res) => {
  const { token } = req.query;

  try {
    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpiry: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).send("Invalid or expired verification link.");
    }

    // Mark user as verified
    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpiry = undefined;

    // Only generate a new API key if it doesn't exist
    if (!user.apiKey) {
      user.apiKey = require("crypto").randomBytes(24).toString("hex");
    }

    await user.save();

    // Decrypt API key before sending
    const decryptedApiKey = user.getDecryptedApiKey();

    // Send email with the decrypted API key
    const subject = "Your PDFify API Key";
    const html = `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <h2 style="color:#6b21a8;">Your API Key is Ready</h2>
        <p>Hi ${user.email},<br><br>Your account is now verified!</p>
        <p>Your API key: <strong>${decryptedApiKey}</strong></p>
        <p style="text-align:center;">
          <a href="${process.env.BASE_URL}" 
             style="background:#6b21a8;color:#fff;padding:10px 20px;text-decoration:none;border-radius:5px;">
             Go to PDFify
          </a>
        </p>
      </div>
    `;
    const text = `Hi ${user.email},\n\nYour account is now verified!\nYour API key: ${decryptedApiKey}\n\nGo to PDFify: ${process.env.BASE_URL}\n\nPDFify Team`;

    await sendEmail({ to: user.email, subject, text, html });

    // Redirect to login page
    res.redirect(`${process.env.BASE_URL}login.html`);
  } catch (error) {
    console.error("Email verification error:", error);
    res.status(500).send("Server error during verification.");
  }
});



router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  log("Login attempt for email:", email);

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.password) {
      return res.status(400).json({ error: "User has no password set" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid password" });
    }

    if (!user.isVerified) {
  return res.status(403).json({ error: "Please verify your email before logging in." });
    }

    req.session.userId = user._id;

    log("Session userId set:", user._id);
    log("Session ID:", req.sessionID);

    // Get decrypted API key with error handling
    let decryptedApiKey;
    try {
      decryptedApiKey = user.getDecryptedApiKey();
      log("API key decrypted successfully");
    } catch (decryptError) {
      console.error("Failed to decrypt API key:", decryptError);
      // Continue without API key - user can still log in
      decryptedApiKey = null;
    }

    // Explicitly save session before responding to ensure it's persisted to MongoDB
    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).json({ error: "Failed to create session" });
      }

      log("Session saved successfully for user:", user.email);

      const responseData = {
        message: "Login successful",
        email: user.email,
        isPremium: user.isPremium,
      };

      // Only include apiKey if decryption succeeded
      if (decryptedApiKey) {
        responseData.apiKey = decryptedApiKey;
      }

      log("Sending login response");
      res.json(responseData);
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
      return res.status(500).json({ error: "Failed to log out" });
    }
    res.clearCookie("connect.sid");
    res.json({ message: "Logged out successfully" });
  });
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