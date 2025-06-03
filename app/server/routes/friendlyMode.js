const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const pdfParse = require('pdf-parse');
const User = require('../models/User');
const authenticate = require('../middleware/authenticate');

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


router.get('/check-access', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Uncomment the next line to simulate premium access during development:
    // return res.json({ accessType: 'premium' });

    const accessType = user.plan === 'premium' ? 'premium' : 'basic';
    res.json({ accessType });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to determine access type' });
  }
});

router.post('/generate', authenticate, async (req, res) => {
  const { template, isPreview, ...formData } = req.body;
  console.log("🚀 PDF generation started");
  console.log("📋 Template:", template);
  console.log("👀 isPreview:", isPreview);

  const templateConfig = templates[template];

  if (!templateConfig) {
    console.log("❌ Invalid template");
    return res.status(400).json({ error: 'Invalid template' });
  }

  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      console.log("❌ User not found");
      return res.status(404).json({ error: 'User not found' });
    }

    let isPremium = user.plan === 'premium';
    console.log("⭐ User isPremium:", isPremium);

    if (templateConfig.premiumOnly && !isPremium) {
      console.log("❌ Access denied: premium-only template");
      return res.status(403).json({ error: 'This template is available for premium users only.' });
    }

    const generateHtml = templateConfig.fn(isPremium);

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
      formData.instructions = formData.instructions.split(/[,;\n]+/).map(i => i.trim()).filter(Boolean);
    }

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

    console.log("📄 PDF page count:", pageCount);
    console.log("📊 Current usage:", user.usageCount);
    console.log("📈 Max usage:", user.maxUsage);

    if (!isPreview) {
      if (user.usageCount + pageCount > user.maxUsage) {
        console.log("❌ Usage limit exceeded");
        fs.unlinkSync(pdfPath);
        return res.status(403).json({
          error: 'Monthly usage limit reached. Upgrade to premium for more pages.',
        });
      }

      user.usageCount += pageCount;
      await user.save();
      console.log("✅ Usage updated. New usage count:", user.usageCount);
    } else {
      console.log("👻 Preview mode – usage not incremented");
    }

    res.download(pdfPath, (err) => {
      if (err) {
        console.error('❗ Error sending file:', err);
      }
      fs.unlinkSync(pdfPath);
      console.log("🧹 Temp file cleaned up");
    });

  } catch (err) {
    console.error('💥 Error during PDF generation:', err);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});


module.exports = router;
