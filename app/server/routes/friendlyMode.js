const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

const invoiceTemplate = require('../templates/invoice');
const recipeTemplate = require('../templates/recipe');

const templates = {
  invoice: invoiceTemplate,
  recipe: recipeTemplate,
};

router.post('/generate', async (req, res) => {
  const { template, formData } = req.body;
  const generateHtml = templates[template];
  
  if (!generateHtml) return res.status(400).json({ error: 'Invalid template' });

  try {
    const html = generateHtml(formData);
    const pdfPath = path.join(__dirname, '../../pdfs', `pdf_${Date.now()}.pdf`);

    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({ path: pdfPath, format: 'A4' });
    await browser.close();

    res.download(pdfPath, err => {
      if (err) console.error(err);
      fs.unlinkSync(pdfPath);
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

module.exports = router;
