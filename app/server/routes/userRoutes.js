const express = require("express");
const bcrypt = require("bcrypt");
const User = require("../models/User");
const authenticate = require("../middleware/authenticate");
const dualAuth = require("../middleware/dualAuth");
const sendEmail = require("../sendEmail");
const ShopConfig = require("../models/ShopConfig"); 

const router = express.Router();


const log = (message, data = null) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(message, data);
  }
};


// Helper: HTML template for emails
const generateEmailHTML = ({ title, body, ctaText, ctaLink }) => `
<div style="font-family: Arial, sans-serif; color: #333; line-height: 1.5;">
  <div style="text-align: center; padding: 20px;">
  <img src="${process.env.BASE_URL}images/Icon.png" alt="PDFify Icon" width="100" style="border-radius: 10px;" />

  </div>
  <h2 style="color: #6b21a8;">${title}</h2>
  <p>${body}</p>
  ${ctaText && ctaLink ? `<p style="text-align: center;">
    <a href="${ctaLink}" 
       style="background-color:#6b21a8; color:#fff; padding: 10px 20px; text-decoration:none; border-radius:5px;">
       ${ctaText}
    </a>
  </p>` : ""}
  <hr style="border:none; border-top:1px solid #ddd; margin:20px 0;" />
  <p style="font-size: 12px; color:#999;">PDFify Team</p>
</div>
`;

// ---------------- USER CREATION ----------------
router.post("/user-creation", async (req, res) => {
  const { email, password } = req.body;

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

      const newApiKey = require("crypto").randomBytes(24).toString("hex");
      user.password = password;
      user.apiKey = newApiKey;
      user.deleted = false;
      user.deletedAt = null;
      await user.save();

      // Account restore email
      const subject = "Welcome back to PDFify!";
      const html = generateEmailHTML({
        title: "Welcome Back!",
        body: `Hi ${email},<br><br>This account was previously deleted. It has now been restored.<br>Your new API key is: <strong>${newApiKey}</strong>`,
        ctaText: "Login Now",
        ctaLink: `${process.env.BASE_URL}login.html`,
      });
      const text = `Hi ${email},\n\nThis account was previously deleted. It has now been restored. Your new API key is: ${newApiKey}\n\nLogin here: ${process.env.BASE_URL}login.html\n\nPDFify Team`;

      await sendEmail({ to: email, subject, text, html });

      return res.status(200).json({
        message: "This account was previously deleted. Restoring...",
        redirect: "/login.html",
      });
    }

    // New user creation
    const apiKey = require("crypto").randomBytes(24).toString("hex");
    const newUser = new User({ email, password, apiKey });
    await newUser.save();

    const subject = "Welcome to PDFify!";
    const html = generateEmailHTML({
      title: "Welcome to PDFify!",
      body: `Hi ${email},<br><br>Thank you for signing up! Your API key is: <strong>${apiKey}</strong><br>Enjoy your PDFify experience.`,
      ctaText: "Go to PDFify",
      ctaLink: process.env.BASE_URL,
    });
    const text = `Hi ${email},\n\nThank you for signing up! Your API key is: ${apiKey}\n\nGo to PDFify: ${process.env.BASE_URL}\n\nPDFify Team`;

    await sendEmail({ to: email, subject, text, html });

    res.status(201).json({ message: "User created", redirect: "/login.html" });

  } catch (error) {
    console.error("User creation error:", error);
    res.status(500).json({ error: "Server error" });
  }
});


// After creating new user
const apiKey = require("crypto").randomBytes(24).toString("hex");
const verificationToken = require("crypto").randomBytes(32).toString("hex");
const expiry = Date.now() + 1000 * 60 * 60 * 24; // 24 hours

const newUser = new User({
  email,
  password,
  apiKey,
  isVerified: false,
  verificationToken,
  verificationTokenExpiry: expiry
});
await newUser.save();

// Send verification email
const verifyUrl = `${process.env.BASE_URL}api/auth/verify-email?token=${verificationToken}`;
const subject = "Verify your PDFify account";
const html = generateEmailHTML({
  title: "Confirm your email",
  body: `Hi ${email},<br><br>Click the button below to verify your email and activate your account.`,
  ctaText: "Verify Email",
  ctaLink: verifyUrl
});
const text = `Hi ${email},\n\nClick this link to verify your email: ${verifyUrl}\n\nThis link expires in 24 hours.\n\nPDFify Team`;

await sendEmail({ to: email, subject, text, html });

res.status(201).json({
  message: "User created. Please check your email to verify your account.",
  redirect: "/login.html"
});




router.post("/consent", authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log("Consent route userId:", userId);

    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        cookieConsent: true,
        cookieConsentDate: new Date()
      },
      { new: true }
    );

    console.log("Updated user:", updatedUser);

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({ message: "Consent saved" });
  } catch (err) {
    console.error("Consent saving error:", err);
    return res.status(500).json({ error: "Failed to save consent" });
  }
});



router.get("/usage", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const planType = user.planType || "free";

    res.json({
      email: user.email,
      apiKey: user.apiKey,        
      usageCount: user.usageCount,
      maxUsage: user.maxUsage,
      extraPages: user.extraPages || 0,
      planType: planType,
    });
  } catch (err) {
    console.error("Error fetching usage:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});




router.get("/me", authenticate, dualAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

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


router.get("/shop-config", authenticate, async (req, res) => {
  const shopDomain = req.user.shopDomain;
  console.log("GET /shop-config for shopDomain:", shopDomain);

  try {
    const config = await ShopConfig.findOne({ shopDomain });
    if (!config) {
      console.log("No ShopConfig found for", shopDomain);
      return res.status(404).json({ error: "Shop config not found" });
    }
    res.json({ iban: config.iban, bic: config.bic });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/shop-config/update", authenticate, async (req, res) => {
  const { iban, bic } = req.body;
  const shopDomain = req.user.shopDomain;
  console.log("PUT /shop-config/update called with:", { shopDomain, iban, bic });

  if (!shopDomain) {
    return res.status(400).json({ error: "shopDomain is missing in request" });
  }

  try {
    const config = await ShopConfig.findOneAndUpdate(
      { shopDomain },
      { iban, bic },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    console.log("Updated/created ShopConfig:", config);
    res.json({ message: "Bank details updated successfully", config });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update bank details" });
  }
});





// ---------------- USER UPDATE (EMAIL/PASSWORD) ----------------
router.put("/update", authenticate, dualAuth, async (req, res) => {
  const { email, password } = req.body;
  const userId = req.user.userId;

  try {
    const user = await User.findById(userId);
    let emailChanged = false;

    if (email && email !== user.email) {
      emailChanged = true;
      user.email = email;
    }

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      user.password = hashedPassword;
    }

    await user.save();
    log("User details updated successfully:", user);

    if (emailChanged || password) {
      const subject = "Your Account Information Has Been Updated";
      const html = generateEmailHTML({
        title: "Account Updated",
        body: `Hi ${user.email},<br><br>Your account information has been updated.<br>If you did not make this change, please contact support immediately.`,
        ctaText: "Go to PDFify",
        ctaLink: `${process.env.BASE_URL}login.html`,
      });
      const text = `Hi ${user.email},\n\nYour account information has been updated.\nIf you did not make this change, please contact support immediately.\n\nPDFify Team`;

      await sendEmail({ to: user.email, subject, text, html });
      log("Update notification email sent to:", user.email);
    }

    res.json({ message: "User details updated successfully!" });
  } catch (error) {
    console.error("Error updating user information:", error);
    res.status(500).json({ error: "Error updating user information" });
  }
});



module.exports = router;