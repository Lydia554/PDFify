const express = require("express");
const bcrypt = require("bcrypt");
const User = require("../models/User");
const authenticate = require("../middleware/authenticate");
const sendEmail = require("../sendEmail");
const router = express.Router();


const log = (message, data = null) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(message, data);
  }
};

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

      const subject = "Welcome back to PDFify!";
      const text = `Hi ${email},\n\nThis account was previously deleted. It has now been restored. Your new API key is: ${newApiKey}\n\nWelcome back!\n\nPDFify Team`;

      await sendEmail({ to: email, subject, text });

      return res.status(200).json({
        message: "This account was previously deleted. Restoring...",
        redirect: "/login.html",
      });
    }

   
    const apiKey = require("crypto").randomBytes(24).toString("hex");
    const newUser = new User({ email, password, apiKey });
    await newUser.save();

    const subject = "Welcome to PDFify!";
    const text = `Hi ${email},\n\nThank you for signing up! Your API key is: ${apiKey}\n\nEnjoy!\n\nThe PDFify Team`;

    await sendEmail({ to: email, subject, text });

    res.status(201).json({ message: "User created", redirect: "/login.html" });

  } catch (error) {
    console.error("User creation error:", error);
    res.status(500).json({ error: "Server error" });
  }
});


router.get("/shopify/connection", authenticate, async (req, res) => {

  try {
    const connectedShopDomain = req.fullUser.connectedShopDomain || null;
    res.json({ connectedShopDomain });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch Shopify connection" });
  }
});


router.post("/shopify/connect", authenticate, async (req, res) => {
  try {
    const { shopDomain, accessToken } = req.body;

    if (!shopDomain || !accessToken) {
      return res.status(400).json({ error: "Shop domain and access token required" });
    }

    const normalizedShopDomain = shopDomain.toLowerCase();

    // Use req.fullUser (the Mongoose doc) to update and save
    req.fullUser.connectedShopDomain = normalizedShopDomain;
    req.fullUser.shopifyAccessToken = accessToken;
    await req.fullUser.save();

    res.json({ message: `Shopify store ${normalizedShopDomain} connected successfully.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to connect Shopify store" });
  }
});

router.post("/shopify/disconnect", authenticate, async (req, res) => {
  try {
    req.fullUser.connectedShopDomain = null;
    req.fullUser.shopifyAccessToken = null;
    await req.fullUser.save();
    res.json({ message: "Shopify store disconnected successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to disconnect Shopify store" });
  }
});




router.get("/usage", authenticate, (req, res) => {
  const user = req.user;

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json({
    email: user.email,
    apiKey: user.apiKey,
    usageCount: user.usageCount,
    maxUsage: user.maxUsage,
    isPremium: user.isPremium,
  });
});

router.get("/me", authenticate, async (req, res) => {
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
    });
  } catch (error) {
    console.error("Error fetching user details:", error);
    res.status(500).json({ error: "Error fetching user details" });
  }
});

router.put("/update", authenticate, async (req, res) => {
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
      const text = `Hi ${user.email},\n\nYour account information has been updated. If you did not make this change, please contact support immediately.\n\nBest regards,\nThe PDFify Team`;

      await sendEmail({
        to: user.email,
        subject,
        text,
      });

      log("Update notification email sent to:", user.email);
    }

    res.json({ message: "User details updated successfully!" });
  } catch (error) {
    console.error("Error updating user information:", error);
    res.status(500).json({ error: "Error updating user information" });
  }
});

router.delete("/delete", authenticate, async (req, res) => {
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




router.post("/unsubscribe", authenticate, async (req, res) => {
  const userId = req.user.userId;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!user.stripeSubscriptionId) {
      return res.status(400).json({ error: "No Stripe subscription found for this user." });
    }


    await stripe.subscriptions.del(user.stripeSubscriptionId);

    
    user.isPremium = false;
    user.maxUsage = 30;
    user.stripeSubscriptionId = undefined;
    await user.save();

    log("Stripe subscription canceled and user downgraded:", user);

    res.json({ message: "Subscription canceled and downgraded to free!" });
  } catch (error) {
    console.error("Error canceling subscription:", error);
    res.status(500).json({ error: "Error canceling subscription" });
  }
});


module.exports = router;