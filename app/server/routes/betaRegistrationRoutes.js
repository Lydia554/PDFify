const express = require("express");
const router = express.Router();
const sendEmail = require("../sendEmail");

router.post("/beta-registration", async (req, res) => {
  try {
    const { name, email, company, useCase, referral } = req.body;

    if (!name || !email || !useCase || !referral) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    if (name.length < 2) {
      return res.status(400).json({ error: "Name must be at least 2 characters" });
    }

    if (useCase.length < 10) {
      return res.status(400).json({ error: "Use case description is too short" });
    }

    const emailSubject = "New Beta Program Registration";
    const emailText = `
New Beta Program Registration:
Name: ${name}
Email: ${email}
Company: ${company || "Not provided"}
Use Case: ${useCase}
Referral Source: ${referral}
Submitted at: ${new Date().toLocaleString()}
`;

    await sendEmail({
      to: process.env.BETA_NOTIFICATION_EMAIL || process.env.EMAIL_USER,
      subject: emailSubject,
      text: emailText,
      attachments: [],
    });

    res.status(200).json({
      message: "Thank you for your interest! We'll be in touch soon.",
      success: true,
    });
  } catch (error) {
    console.error("Beta registration error:", error);
    res.status(500).json({
      error: "Failed to process registration. Please try again later.",
    });
  }
});

module.exports = router;
