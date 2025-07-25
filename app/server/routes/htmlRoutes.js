const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const dualAuth = require("../middleware/dualAuth");
const User = require('../models/User');
const { PDFDocument } = require("pdf-lib");
const { incrementUsage } = require("../utils/usageUtils");


const logoUrl = "https://pdfify.pro/images/Logo.png";

function wrapHtmlWithBranding(htmlContent, isPremium, addWatermark) {
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
            min-height: 90vh;
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
        position: static;
        max-width: 800px;
        margin: 40px auto 10px auto;
        padding: 10px 20px;
        background-color: #f0f2f7;
        color: #555;
        border-top: 2px solid #cbd2e1;
        text-align: center;
        line-height: 1.6;
        font-size: 11px;
        border-radius: 0 0 16px 16px;
        box-sizing: border-box;
      }

      .footer p {
        margin: 6px 0;
      }

      .footer a {
        color: #4a69bd;
        text-decoration: none;
        word-break: break-word;
      }

      .footer a:hover {
        text-decoration: underline;
      }

          /* Watermark styles */
          ${
            addWatermark
              ? `
            .watermark {
              position: fixed;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%) rotate(-45deg);
              font-size: 5rem;
              color: rgba(255, 0, 0, 0.1);
              user-select: none;
              pointer-events: none;
              z-index: 9999;
              white-space: nowrap;
              font-weight: bold;
            }
          `
              : ''
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

        ${isPremium ? '' : `<img src="${logoUrl}" alt="Logo" class="logo" />`}
        ${addWatermark ? `<div class="watermark">FOR PRODUCTION ONLY - NOT AVAILABLE IN BASIC</div>` : ''}
        <div class="content">
          ${htmlContent}
        </div>
 </div>

       <div class="footer">
      <p>Thanks for using our service!</p>
      <p>If you have questions, contact us at <a href="mailto:pdfifyapi@gmail.com">pdfifyapi@gmail.com</a>.</p>
      <p>&copy; 2025 🧾PDFify — All rights reserved.</p>
      <p>
        Generated using <strong>PDFify</strong>. Visit
        <a href="https://pdfify.pro/" target="_blank">our site</a> for more.
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
    if (!user) return res.status(404).json({ error: "User not found" });

    const now = new Date();
    if (!user.usageLastReset) {
      user.usageLastReset = now;
      user.usageCount = 0;
      user.previewCount = 0;
      await user.save();
    } else {
      const lastReset = new Date(user.usageLastReset);
      if (
        now.getFullYear() > lastReset.getFullYear() ||
        now.getMonth() > lastReset.getMonth()
      ) {
        user.usageCount = 0;
        user.previewCount = 0;
        user.usageLastReset = now;
        await user.save();
      }
    }

    const pdfDir = path.join(__dirname, "../pdfs");
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

    const safeId = `htmlpdf_${Date.now()}`;
    const pdfPath = path.join(pdfDir, `${safeId}.pdf`);

    const addWatermark = isPreview && !user.isPremium && user.previewCount >= 3;

    if (isPreview && !user.isPremium && user.previewCount < 3) {
      user.previewCount++;
      await user.save();
    }

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

    
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pageCount = pdfDoc.getPageCount();

    
    await incrementUsage(user, isPreview, pageCount);

    res.download(pdfPath, (err) => {
      if (err) console.error("Error sending file:", err);
      if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
    });
  } catch (error) {
    console.error("PDF generation error:", error);
    res.status(500).json({ error: "PDF generation failed" });
  }
});


module.exports = router;
