const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const authenticate = require('../middleware/authenticate'); 

const logoUrl = "https://pdf-api.portfolio.lidija-jokic.com/images/Logo.png";

if (typeof ReadableStream === 'undefined') {
  global.ReadableStream = require('web-streams-polyfill').ReadableStream;
}

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


router.post('/generate-pdf-from-html', authenticate, async (req, res) => {
  console.log('📥 POST /generate-pdf-from-html called');
  console.log('🔐 Authenticated user:', req.user ? req.user.email : 'Not Authenticated');
  const { html } = req.body;

  if (!html) {
    console.warn('⚠️ No HTML content provided in request body');
    return res.status(400).json({ error: 'No HTML content provided' });
  }

  console.log('📝 HTML content received (first 200 chars):', html.substring(0, 200));

  const wrappedHtml = wrapHtmlWithBranding(html);

  const pdfDir = './pdfs';
  if (!fs.existsSync(pdfDir)) {
    console.log('📁 Creating PDF directory...');
    fs.mkdirSync(pdfDir, { recursive: true });
  }

  const pdfPath = path.join(pdfDir, `generated_pdf_${Date.now()}.pdf`);
  console.log(`📄 PDF will be saved to: ${pdfPath}`);

  try {
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
