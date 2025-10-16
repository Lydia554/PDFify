const express = require("express");
const router = express.Router();
const sendEmail = require("../sendEmail");
const { verifyTurnstile } = require("../utils/turnstileVerification");

// Rate limiting store (simple in-memory, use Redis for production)
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX_REQUESTS = 5;

// Rate limiting middleware
function rateLimiter(req, res, next) {
  const clientIP = req.ip || req.connection.remoteAddress;
  const now = Date.now();

  if (!rateLimitStore.has(clientIP)) {
    rateLimitStore.set(clientIP, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }

  const record = rateLimitStore.get(clientIP);

  if (now > record.resetTime) {
    rateLimitStore.set(clientIP, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({
      error: "Too many registration attempts. Please try again later."
    });
  }

  record.count++;
  rateLimitStore.set(clientIP, record);
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) {
      rateLimitStore.delete(ip);
    }
  }
}, 60 * 60 * 1000);

router.post("/beta-registration", rateLimiter, async (req, res) => {
  try {
    const {
      name, email, company, useCase, referral, turnstileToken, website,
      shopifyStoreUrl, monthlyOrderVolume, currentProcess, biggestChallenge,
      technicalComfort, feedbackCommitment
    } = req.body;

    if (website && website !== "") {
      console.log("Bot detected via honeypot field");
      return res.status(400).json({ error: "Invalid submission" });
    }

    if (!turnstileToken) {
      return res.status(400).json({ error: "Security verification required" });
    }

    const clientIP = req.ip || req.connection.remoteAddress;
    const turnstileResult = await verifyTurnstile(turnstileToken, clientIP);

    if (!turnstileResult.success) {
      console.log("Turnstile verification failed:", turnstileResult.error);
      return res.status(403).json({ error: "Security verification failed. Please try again." });
    }

    if (!name || !email || !company || !useCase) {
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

    // Plain-text fallback
    const emailText = `
New Shopify Beta Partner Application

Name: ${name}
Email: ${email}
Company: ${company}
Shopify Store URL: ${shopifyStoreUrl || "Not provided"}
Monthly Order Volume: ${monthlyOrderVolume || "Not provided"}
Current Process: ${currentProcess || "Not provided"}
Biggest Challenge: ${biggestChallenge || "Not provided"}
Technical Comfort Level: ${technicalComfort || "Not provided"}
Feedback Commitment: ${feedbackCommitment ? "Yes - Agreed" : "Not confirmed"}
Use Case Details: ${useCase}
Referral: ${referral || "Not provided"}
Submitted at: ${new Date().toLocaleString()}
`;

    // HTML email
    const emailHtml = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <title>New Shopify Beta Partner Application</title>
    <style>
      body { font-family: Arial, sans-serif; background-color: #f9f9f9; margin: 0; padding: 20px; color: #333; }
      .container { background: #fff; max-width: 600px; margin: 0 auto; padding: 20px; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.1); }
      h2 { color: #6b21a8; margin-top: 0; border-bottom: 2px solid #eee; padding-bottom: 8px; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      td { padding: 8px; border-bottom: 1px solid #eee; vertical-align: top; }
      td.label { font-weight: bold; width: 180px; color: #555; }
      .footer { margin-top: 20px; font-size: 12px; color: #999; text-align: center; }
    </style>
  </head>
  <body>
    <div class="container">
      <h2>New Shopify Beta Partner Application</h2>
      <table>
        <tr><td class="label">Full Name:</td><td>${name}</td></tr>
        <tr><td class="label">Business Email:</td><td>${email}</td></tr>
        <tr><td class="label">Business/Brand Name:</td><td>${company}</td></tr>
        <tr><td class="label">Shopify Store URL:</td><td>${shopifyStoreUrl || "Not provided"}</td></tr>
        <tr><td class="label">Monthly Order Volume:</td><td>${monthlyOrderVolume || "Not provided"}</td></tr>
        <tr><td class="label">Current Process:</td><td>${currentProcess || "Not provided"}</td></tr>
        <tr><td class="label">Biggest Challenge:</td><td>${biggestChallenge || "Not provided"}</td></tr>
        <tr><td class="label">Technical Comfort Level:</td><td>${technicalComfort || "Not provided"}</td></tr>
        <tr><td class="label">Feedback Commitment:</td><td>${feedbackCommitment ? "Yes - Agreed" : "Not confirmed"}</td></tr>
        <tr><td class="label">Use Case Details:</td><td>${useCase}</td></tr>
        <tr><td class="label">Referral:</td><td>${referral || "Not provided"}</td></tr>
        <tr><td class="label">Submitted at:</td><td>${new Date().toLocaleString()}</td></tr>
      </table>
      <div class="footer">PDFify Team</div>
    </div>
  </body>
</html>
`;

    await sendEmail({
      to: process.env.BETA_NOTIFICATION_EMAIL || process.env.EMAIL_USER,
      subject: emailSubject,
      text: emailText,
      html: emailHtml,
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
