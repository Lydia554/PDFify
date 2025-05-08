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


router.post("/generate-pdf-from-html", async (req, res) => {
    const { html } = req.body;
  
    if (!html) {
      return res.status(400).json({ error: "No HTML content provided" });
    }
  
    const pdfDir = './pdfs';
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }
  
    const pdfPath = path.join(pdfDir, `generated_pdf_${Date.now()}.pdf`);
  
    try {
      const browser = await puppeteer.launch({ headless: true });
      const page = await browser.newPage();
  
      await page.setContent(html, { waitUntil: "networkidle0" });
  
      await page.pdf({
        path: pdfPath,
        format: "A4",
        printBackground: true
      });
  
      await browser.close();
  
      res.download(pdfPath, (err) => {
        if (err) {
          console.error("Error sending file:", err);
        }
        fs.unlinkSync(pdfPath);
      });
    } catch (error) {
      console.error("PDF generation failed:", error);
      res.status(500).json({ error: "PDF generation failed" });
    }
  });

module.exports = router;
