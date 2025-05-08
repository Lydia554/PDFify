const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require("fs");
const router = express.Router();
const authenticate = require("../middleware/authenticate");

if (typeof ReadableStream === "undefined") {
  global.ReadableStream = require("web-streams-polyfill").ReadableStream;
}

const logoUrl = "https://pdf-api.portfolio.lidija-jokic.com/images/Logo.png";

const log = (message, data = null) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(message, data);
  }
};

function wrapHtmlWithBranding(htmlContent) {
  return `
    <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 30px;
            background-color: #fff;
            color: #333;
          }
          .logo {
            display: block;
            margin: 0 auto 20px;
            max-width: 120px;
          }
          .content {
            margin-top: 30px;
          }
        </style>
      </head>
      <body>
        <img src="${logoUrl}" alt="Logo" class="logo" />
        <div class="content">
          ${htmlContent}
        </div>
      </body>
    </html>
  `;
}

router.post("/generate-html-pdf", authenticate, async (req, res) => {
  const { html } = req.body;

  if (!html) {
    return res.status(400).json({ error: "Missing raw HTML content" });
  }

  const pdfDir = path.join(__dirname, "../pdfs");
  if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir, { recursive: true });
  }

  const pdfPath = path.join(pdfDir, `raw_html_${Date.now()}.pdf`);

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    const wrappedHtml = wrapHtmlWithBranding(html);

    await page.setContent(wrappedHtml, { waitUntil: "networkidle0" });
    await page.pdf({ path: pdfPath, format: "A4" });

    await browser.close();

    res.download(pdfPath, (err) => {
      if (err) {
        console.error("Error sending file:", err);
      }
      fs.unlinkSync(pdfPath);
    });
  } catch (error) {
    console.error("Raw HTML PDF generation failed:", error);
    res.status(500).json({ error: "PDF generation failed" });
  }
});

module.exports = router;
