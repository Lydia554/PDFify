const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const dualAuth = require("../middleware/dualAuth");
const User = require('../models/User');
const pdfParse = require("pdf-parse");

const log = (message, data = null) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(`[DEV LOG] ${message}`, data || '');
  }
};

if (typeof ReadableStream === 'undefined') {
  global.ReadableStream = require('web-streams-polyfill').ReadableStream;
}

const logoUrl = "https://pdf-api.portfolio.lidija-jokic.com/images/Logo.png";

// Watermark HTML for basic user previews
const watermarkHtml = `
  <div style="
    position: fixed;
    top: 40%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-30deg);
    color: rgba(200, 0, 0, 0.15);
    font-size: 48px;
    font-weight: 900;
    z-index: 9999;
    pointer-events: none;
    white-space: nowrap;
  ">
    PREVIEW ONLY – NOT FOR PRODUCTION USE
  </div>
`;

function wrapHtmlWithBranding(htmlContent, isPremium, showWatermark) {
  return `
    <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 30px;
            background-color: #fff;
            color: #333;
            position: relative;
            min-height: 100vh;
            box-sizing: border-box;
          }
          .logo {
            display: block;
            margin: 0 auto 20px;
            max-width: 120px;
          }
          .content {
            margin-top: 30px;
          }
          .footer {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 20px;
            font-size: 12px;
            background-color: #f9f9f9;
            color: #444;
            border-top: 1px solid #ccc;
            text-align: center;
            line-height: 1.6;
          }
          .footer a {
            color: #0073e6;
            text-decoration: none;
          }
          .footer a:hover {
            text-decoration: underline;
          }

          @media (max-width: 600px) {
            body {
              padding: 20px;
            }
            .content {
              font-size: 15px;
            }
            .footer {
              font-size: 11px;
              padding: 15px 10px;
              line-height: 1.4;
            }
            .footer p {
              margin: 6px 0;
            }
            .footer a {
              word-break: break-word;
            }
            .logo {
              max-width: 100px;
            }
          }
        </style>
      </head>
      <body>
        ${!isPremium ? `<img src="${logoUrl}" alt="Logo" class="logo" />` : ''}
        ${showWatermark ? watermarkHtml : ''}
        <div class="content">
          ${htmlContent}
        </div>
        <div class="footer">
          <p>Thanks for using our service!</p>
          <p>If you have questions, contact us at <a href="mailto:supportpdfifyapi@gmail.com">supportpdfifyapi@gmail.com</a>.</p>
          <p>&copy; 2025 🧾PDFify — All rights reserved.</p>
          <p>
            Generated using <strong>PDFify</strong>. Visit
            <a href="https://pdf-api.portfolio.lidija-jokic.com/" target="_blank">our site</a> for more.
          </p>
        </div>
      </body>
    </html>
  `;
}

router.post("/generate-pdf-from-html", authenticate, dualAuth, async (req, res) => {
  const { html, isPreview } = req.body;

  if (!html) {
    return res.status(400).json({ error: "No HTML content provided" });
  }

  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const isBasicUser = !user.isPremium;

    // Initialize tracking fields if missing
    user.previewCount = user.previewCount || 0;
    user.lastPreviewReset = user.lastPreviewReset || new Date(0);
    user.usageCount = user.usageCount || 0;
    user.maxUsage = user.maxUsage || 1000; // adjust as needed

    const now = new Date();

    // Reset preview count monthly
    if (
      now.getUTCFullYear() !== user.lastPreviewReset.getUTCFullYear() ||
      now.getUTCMonth() !== user.lastPreviewReset.getUTCMonth()
    ) {
      user.previewCount = 0;
      user.lastPreviewReset = now;
      await user.save();
    }

    let addWatermark = false;

    if (isBasicUser && isPreview) {
      if (user.previewCount < 3) {
        user.previewCount++;
        addWatermark = true;
        await user.save();
      }
    }

    const pdfDir = path.join(__dirname, "../pdfs");
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const safeId = `htmlpdf_${Date.now()}`;
    const pdfPath = path.join(pdfDir, `${safeId}.pdf`);

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    const wrappedHtml = wrapHtmlWithBranding(html, user.isPremium, addWatermark);

    await page.setContent(wrappedHtml, { waitUntil: "networkidle0" });
    await page.pdf({ path: pdfPath, format: "A4", printBackground: true });
    await browser.close();

    const pdfBuffer = fs.readFileSync(pdfPath);
    const parsed = await pdfParse(pdfBuffer);
    const pageCount = parsed.numpages;

    if (!isPreview || (isBasicUser && user.previewCount >= 3)) {
      if (user.usageCount + pageCount > user.maxUsage) {
        fs.unlinkSync(pdfPath);
        return res.status(403).json({
          error: "Monthly usage limit reached. Upgrade to premium for more pages.",
        });
      }
      user.usageCount += pageCount;
      await user.save();
    }

    res.download(pdfPath, (err) => {
      if (err) {
        console.error("Error sending file:", err);
      }
      if (fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath);
      }
    });

  } catch (error) {
    console.error("PDF generation error:", error);
    res.status(500).json({ error: "PDF generation failed" });
  }
});

module.exports = router;
