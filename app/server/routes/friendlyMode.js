const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const pdfParse = require('pdf-parse');
const User = require('../models/User');
const authenticate = require('../middleware/authenticate');

const invoiceTemplate = require('../templates-friendly-mode/invoice');
const recipeTemplateBasic = require('../templates-friendly-mode/recipe');
const recipeTemplatePremium = require('../templates-friendly-mode/recipe-premium');

const templates = {
  invoice: {
    fn: () => invoiceTemplate,
    premiumOnly: false,
  },
  recipe: {
    fn: (isPremium) => isPremium ? recipeTemplatePremium : recipeTemplateBasic,
    premiumOnly: false,
  }
};


//router.get('/check-access', authenticate, async (req, res) => {
 // try {
   // const user = await User.findById(req.user.userId);

   // if (!user) {
    //  return res.status(404).json({ error: 'User not found' });
   // }

    //const accessType = user.plan === 'premium' ? 'premium' : 'basic';
   // res.json({ accessType });
  //} catch (err) {
  //  console.error(err);
   // res.status(500).json({ error: 'Failed to determine access type' });
  //}
//});


router.get('/check-access', authenticate, async (req, res) => {
  try {
    // TEMP: Force premium access during development
    return res.json({ accessType: 'premium' });

    // const user = await User.findById(req.user.userId);
    // if (!user) return res.status(404).json({ error: 'User not found' });
    // const accessType = user.plan === 'premium' ? 'premium' : 'basic';
    // res.json({ accessType });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to determine access type' });
  }
});


router.post('/generate', authenticate, async (req, res) => {
  const { template, ...formData } = req.body;

  const templateConfig = templates[template];
  if (!templateConfig) {
    return res.status(400).json({ error: 'Invalid template' });
  }

  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isDevMode = process.env.NODE_ENV !== 'production';
    const isPremium = isDevMode ? true : user.plan === 'premium';
    
    


    if (templateConfig.premiumOnly && !isPremium) {
      return res.status(403).json({ error: 'This template is available for premium users only.' });
    }

   
    const generateHtml = templateConfig.fn(isPremium);
    const html = generateHtml(formData);

    const pdfDir = path.join(__dirname, '../../pdfs');
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const pdfPath = path.join(pdfDir, `pdf_${Date.now()}.pdf`);

    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({ path: pdfPath, format: 'A4' });
    await browser.close();

    const pdfBuffer = fs.readFileSync(pdfPath);
    const parsed = await pdfParse(pdfBuffer);
    const pageCount = parsed.numpages;

    console.log(`User will use ${pageCount} pages`);

    if (user.usageCount + pageCount > user.maxUsage) {
      fs.unlinkSync(pdfPath);
      return res.status(403).json({
        error: 'Monthly usage limit reached. Upgrade to premium for more pages.',
      });
    }

    user.usageCount += pageCount;
    await user.save();

    res.download(pdfPath, (err) => {
      if (err) console.error('Error sending file:', err);
      fs.unlinkSync(pdfPath);
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

module.exports = router;
