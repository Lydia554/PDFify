const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const authenticate = require('../middleware/authenticate'); 
const User = require('../models/User');
const pdfParse = require("pdf-parse");



if (typeof ReadableStream === 'undefined') {
  global.ReadableStream = require('web-streams-polyfill').ReadableStream;
}

const logoUrl = "https://pdf-api.portfolio.lidija-jokic.com/images/Logo.png";

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
          .footer {
            text-align: center;
            margin-top: 40px;
            font-size: 14px;
            color: #777;
            border-top: 1px dashed #ccc;
            padding-top: 20px;
          }
          .footer a {
            color: #2a3d66;
            text-decoration: none;
          }
          .footer a:hover {
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <img src="${logoUrl}" alt="Logo" class="logo" />
        <div class="content">
          ${htmlContent}
        </div>
        <div class="footer">
          <p>Thanks for using our service!</p>
          <p>If you have questions, contact us at <a href="mailto:supportpdfifyapi@gmail.com">supportpdfifyapi@gmail.com</a>.</p>
        </div>
      </body>
    </html>
  `;
}


router.post('/generate-pdf-from-html', authenticate, async (req, res) => {
  console.log('📥 POST /generate-pdf-from-html called');
  console.log('🔐 Authenticated user:', req.user ? req.user.email : 'Not Authenticated');
  const { html } = req.body;

  if (!html) {
    console.warn('⚠️ No HTML content provided in request body');
    return res.status(400).json({ error: 'No HTML content provided' });
  }

  console.log('📝 HTML content received (first 200 chars):', html.substring(0, 200));

  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const wrappedHtml = wrapHtmlWithBranding(html);

    const pdfDir = './pdfs';
    if (!fs.existsSync(pdfDir)) {
      console.log('📁 Creating PDF directory...');
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const pdfPath = path.join(pdfDir, `generated_pdf_${Date.now()}.pdf`);
    console.log(`📄 PDF will be saved to: ${pdfPath}`);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setContent(wrappedHtml, { waitUntil: 'networkidle0' });
    console.log('📄 HTML content loaded into Puppeteer');

    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
    });
    console.log('✅ PDF successfully generated');

    await browser.close();

  
    const pdfBuffer = fs.readFileSync(pdfPath);
    const parsed = await pdfParse(pdfBuffer);
    const pageCount = parsed.numpages;

    if (user.usageCount + pageCount > user.maxUsage) {
      fs.unlinkSync(pdfPath);
      return res.status(403).json({
        error: "Monthly usage limit reached. Upgrade to premium for more pages.",
      });
    }

    user.usageCount += pageCount;
    await user.save();

    res.download(pdfPath, (err) => {
      if (err) {
        console.error('❌ Error sending file:', err);
      } else {
        console.log('📤 PDF sent to client, deleting temp file');
        fs.unlinkSync(pdfPath);
      }
    });

  } catch (error) {
    console.error('❌ PDF generation failed:', error);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

module.exports = router;
