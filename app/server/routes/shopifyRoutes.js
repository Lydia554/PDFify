const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');
const ShopConfig = require('../models/ShopConfig');

router.post('/invoice', async (req, res) => {
  try {
    const data = req.body;

    const shopDomain = data.shopDomain || ''; // Required for shop-specific config

    const shopConfig = await ShopConfig.findOne({ shopDomain });

    if (!shopConfig) {
      return res.status(404).send('Shop config not found');
    }
    const fallbackHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            background: #fff;
            color: #000;
            padding: 20px;
          }
        </style>
      </head>
      <body>
        <h1>Test Invoice</h1>
        <p>This is a fallback test. If you see this, PDF generation works.</p>
      </body>
    </html>
  `;
  

    console.log("HTML length:", html.length);
console.log("HTML preview:", html.substring(0, 300));

    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
    const page = await browser.newPage();
    await page.goto(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`, {
        waitUntil: 'networkidle0',
      });
      
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename=invoice.pdf',
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Invoice generation error:', err);
    res.status(500).send('Failed to generate invoice');
  }
});

module.exports = router;
