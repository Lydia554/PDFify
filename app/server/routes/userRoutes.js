const express = require("express");
const bcrypt = require("bcrypt");
const User = require("../models/User");
const authenticate = require("../middleware/authenticate");
const checkSubscription = require("../middleware/checkSubscription");
const sendEmail = require("../sendEmail");
const router = express.Router();


const log = (message, data = null) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(message, data);
  }
};

router.post("/create-user", async (req, res) => {
  const { email, password } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }

    
    const newUser = new User({
      email,
      password,
     
    });

    await newUser.save(); 


    const subject = "Welcome to PDF Generator!";
    const text = `Hi ${email},\n\nThank you for signing up for PDF Generator! Your API key is: ${newUser.apiKey}\n\nEnjoy using our service!\n\nBest regards,\nThe PDF Generator Team`;

    await sendEmail({
      to: email,
      subject,
      text,
    });

    res.status(201).json({ message: "User created successfully", redirect: "/login.html" });
  } catch (error) {
    console.error("Error creating user or sending email:", error);
    res.status(500).json({ error: "Server error" });
  }
});


router.get("/usage", authenticate, (req, res) => {
  const user = req.user;
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json({
    email: user.email,
    apiKey: user.getDecryptedApiKey(),
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
      const text = `Hi ${user.email},\n\nYour account information has been updated. If you did not make this change, please contact support immediately.\n\nBest regards,\nThe PDF Generator Team`;

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
    const deletedUser = await User.findByIdAndDelete(userId);

    if (!deletedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    log("User account deleted successfully:", deletedUser);

    res.json({ message: "User account deleted successfully!" });
  } catch (error) {
    console.error("Error deleting user account:", error);
    res.status(500).json({ error: "Error deleting user account" });
  }
});

router.post("/subscribe", authenticate, async (req, res) => {
  const userId = req.user.userId;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.isPremium = true;
    user.maxUsage = 1000;
    await user.save();

    log("Subscription upgraded to premium for user:", user);

    res.json({ message: "Subscription upgraded to premium!" });
  } catch (error) {
    console.error("Error upgrading subscription:", error);
    res.status(500).json({ error: "Error upgrading subscription" });
  }
});

router.post("/unsubscribe", authenticate, async (req, res) => {
  const userId = req.user.userId;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.isPremium = false;
    user.maxUsage = 30;
    await user.save();

    log("Subscription downgraded to free for user:", user);

    res.json({ message: "Subscription downgraded to free!" });
  } catch (error) {
    console.error("Error downgrading subscription:", error);
    res.status(500).json({ error: "Error downgrading subscription" });
  }
});

router.get("/premium-content", authenticate, checkSubscription, (req, res) => {
  log("Accessed premium content by user:", req.user);
  res.json({ message: "Welcome to the premium content!" });
});

module.exports = router;