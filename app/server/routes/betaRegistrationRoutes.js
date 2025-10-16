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

  // Get or create rate limit record for this IP
  if (!rateLimitStore.has(clientIP)) {
    rateLimitStore.set(clientIP, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }

  const record = rateLimitStore.get(clientIP);

  // Reset if window expired
  if (now > record.resetTime) {
    rateLimitStore.set(clientIP, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }

  // Check if limit exceeded
  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({
      error: "Too many registration attempts. Please try again later."
    });
  }

  // Increment count
  record.count++;
  rateLimitStore.set(clientIP, record);
  next();
}

// Clean up old entries every hour
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
    const { name, email, company, useCase, referral, turnstileToken, website,
            shopifyStoreUrl, monthlyOrderVolume, currentProcess, biggestChallenge,
            technicalComfort, feedbackCommitment } = req.body;

    // Honeypot check - reject if filled
    if (website && website !== "") {
      console.log("Bot detected via honeypot field");
      return res.status(400).json({ error: "Invalid submission" });
    }

    // Verify Turnstile token
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

const emailSubject = "New Shopify Beta Partner Application";

const emailText = `
New Shopify Beta Partner Application

=== ABOUT YOU & YOUR BUSINESS ===
Full Name: ${name}
Business Email: ${email}
Business/Brand Name: ${company}
Shopify Store URL: ${shopifyStoreUrl || "Not provided"}

=== INVOICING NEEDS ===
Monthly Order Volume: ${monthlyOrderVolume || "Not provided"}
Current Invoicing Process: ${currentProcess || "Not provided"}
Biggest Challenge: ${biggestChallenge || "Not provided"}

=== TECHNICAL & FEEDBACK ===
Technical Comfort Level: ${technicalComfort || "Not provided"}
Feedback Commitment: ${feedbackCommitment ? "Yes - Agreed" : "Not confirmed"}

=== ADDITIONAL INFORMATION ===
Use Case Details: ${useCase}
Referral: ${referral || "Not provided"}

Submitted at: ${new Date().toLocaleString()}
`;


const emailHtml = `
<html>
  <body>
    <h2>New Shopify Beta Partner Application</h2>
    <p><strong>Full Name:</strong> ${name}</p>
    <p><strong>Business Email:</strong> ${email}</p>
    <p><strong>Business/Brand Name:</strong> ${company}</p>
    <p><strong>Shopify Store URL:</strong> ${shopifyStoreUrl || "Not provided"}</p>
    <p><strong>Monthly Order Volume:</strong> ${monthlyOrderVolume || "Not provided"}</p>
    <p><strong>Current Invoicing Process:</strong> ${currentProcess || "Not provided"}</p>
    <p><strong>Biggest Challenge:</strong> ${biggestChallenge || "Not provided"}</p>
    <p><strong>Technical Comfort Level:</strong> ${technicalComfort || "Not provided"}</p>
    <p><strong>Feedback Commitment:</strong> ${feedbackCommitment ? "Yes - Agreed" : "Not confirmed"}</p>
    <p><strong>Use Case Details:</strong> ${useCase}</p>
    <p><strong>Referral:</strong> ${referral || "Not provided"}</p>
    <p>Submitted at: ${new Date().toLocaleString()}</p>
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
