const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const { PDFDocument } = require("pdf-lib");
const { incrementUsage } = require("../utils/usageUtils");
const User = require('../models/User');
const authenticate = require('../middleware/authenticate');
const dualAuth = require("../middleware/dualAuth");
const invoiceTemplate = require('../templates-friendly-mode/invoice');
const invoiceTemplatePremium = require('../templates-friendly-mode/invoice-premium');


const recipeTemplateBasic = require('../templates-friendly-mode/recipe');
const recipeTemplatePremium = require('../templates-friendly-mode/recipe-premium');


const templates = {
  invoice: {
    fn: (isPremium) => isPremium ? invoiceTemplatePremium : invoiceTemplate,
    premiumOnly: false,
  },
  recipe: {
    fn: (isPremium) => isPremium ? recipeTemplatePremium : recipeTemplateBasic,
    premiumOnly: false,
  },
};


const FORCE_PLAN = process.env.FORCE_PLAN; 
router.get('/check-access', authenticate, dualAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Use forced plan if set, else user.plan
    const plan = FORCE_PLAN || user.plan;

    // Treat both 'premium' and 'pro' as premium access
    const accessType = (plan === 'premium' || plan === 'pro') ? 'premium' : 'basic';

    res.json({ accessType });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to determine access type' });
  }
});

router.post('/generate', authenticate, dualAuth, async (req, res) => {
  const { template, isPreview, ...formData } = req.body;

  const templateConfig = templates[template];
  if (!templateConfig) {
    return res.status(400).json({ error: 'Invalid template' });
  }

  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

  
    const plan = FORCE_PLAN && FORCE_PLAN.trim() !== "" ? FORCE_PLAN : user.plan;


   
    const isPremium = (plan === 'premium' || plan === 'pro');

    if (templateConfig.premiumOnly && !isPremium) {
      return res.status(403).json({ error: 'This template is available for premium users only.' });
    }

    if (!isPremium) {
      formData.logoBase64 = null;
    }

  
    if (typeof formData.items === 'string') {
      const rows = formData.items.split(/\n|;/).map(row => row.trim()).filter(Boolean);
      formData.items = rows.map(row => {
        const [description, quantity, unitPrice] = row.split(',').map(val => val.trim());
        return {
          description: description || 'Item',
          quantity: Number(quantity) || 1,
          unitPrice: Number(unitPrice) || 0
        };
      });
    }

    if (typeof formData.ingredients === 'string') {
      formData.ingredients = formData.ingredients.split(/[,;\n]+/).map(i => i.trim()).filter(Boolean);
    }

    if (typeof formData.instructions === 'string') {
      formData.instructions = formData.instructions
  .split(';')       
  .map(i => i.trim())
  .filter(Boolean);

    }


   const generateHtml = templateConfig.fn(isPremium);
const language = formData.language || 'en';
formData.language = language; 
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
  const pdfDoc = await PDFDocument.load(pdfBuffer);
const pageCount = pdfDoc.getPageCount();


const usageAllowed = await incrementUsage(user, pageCount, isPreview, plan);
if (!usageAllowed) {
  return res.status(403).json({ error: 'Monthly usage limit reached. Upgrade to premium for more pages.' });
}


if (!usageAllowed) {
  fs.unlinkSync(pdfPath);
  return res.status(403).json({
    error: 'Monthly usage limit reached. Upgrade to premium for more pages.',
  });
}


    res.download(pdfPath, (err) => {
      if (err) {
     
      }
      fs.unlinkSync(pdfPath);
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});


module.exports = router;
