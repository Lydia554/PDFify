const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const authenticate = require('../middleware/authenticate'); 
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


         /* MOBILE STYLES */
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
        <img src="${logoUrl}" alt="Logo" class="logo" />
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

router.post('/generate-pdf-from-html', authenticate, async (req, res) => {
  console.log('[Route] /generate-pdf-from-html called');
  console.log('[Route] req.body:', req.body);

  const { html, isPreview } = req.body;

  if (!html) {
    console.log('[Error] No HTML content provided');
    return res.status(400).json({ error: 'No HTML content provided' });
  }

  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      console.log('[Error] User not found for ID:', req.user.userId);
      return res.status(404).json({ error: "User not found" });
    }

    console.log('[Info] User found:', user.email);
    console.log('[Info] isPreview:', isPreview);

    const wrappedHtml = wrapHtmlWithBranding(html);
    console.log('[Info] HTML wrapped with branding');

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    console.log('[Info] Puppeteer browser launched');

    const page = await browser.newPage();
    await page.setContent(wrappedHtml, { waitUntil: 'networkidle0' });
    console.log('[Info] HTML content set on Puppeteer page');

    if (isPreview) {
      const buffer = await page.pdf({ format: 'A4', printBackground: true });
      await browser.close();
      console.log('[Info] PDF buffer generated for preview');

      const base64 = buffer.toString('base64');
      console.log('[Info] Sending PDF preview response');
      return res.json({ preview: base64 });
    }

    // Normal full PDF generation logic
    const pdfDir = './pdfs';
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
      console.log('[Info] PDF directory created:', pdfDir);
    }

    const pdfPath = path.join(pdfDir, `generated_pdf_${Date.now()}.pdf`);
    console.log('[Info] PDF path:', pdfPath);

    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
    await browser.close();
    console.log('[Info] PDF file saved and browser closed');

    const pdfBuffer = fs.readFileSync(pdfPath);
    const parsed = await pdfParse(pdfBuffer);
    const pageCount = parsed.numpages;
    console.log('[Info] PDF parsed for page count:', pageCount);

    if (user.usageCount + pageCount > user.maxUsage) {
      fs.unlinkSync(pdfPath);
      console.log('[Error] Usage limit exceeded, PDF deleted');
      return res.status(403).json({
        error: "Monthly usage limit reached. Upgrade to premium for more pages.",
      });
    }

    user.usageCount += pageCount;
    await user.save();
    console.log('[Info] User usage count updated:', user.usageCount);

    res.download(pdfPath, (err) => {
      if (err) {
        console.log('[Error] Error during PDF download:', err);
      } else {
        fs.unlinkSync(pdfPath);
        console.log('[Info] PDF sent and deleted from server');
      }
    });

  } catch (error) {
    console.log('[Error] Unhandled error in PDF generation route:', error);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});


module.exports = router;