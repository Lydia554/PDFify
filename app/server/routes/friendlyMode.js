const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const pdfParse = require('pdf-parse');
const multer = require('multer');
const sharp = require('sharp');

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

const upload = multer({ dest: 'uploads/' });


// Route: Check user access type
router.get('/check-access', authenticate, dualAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Uncomment the next line to simulate premium access during development:
    return res.json({ accessType: 'premium' });

    // Normal logic:
    // const accessType = user.plan === 'premium' ? 'premium' : 'basic';
    // res.json({ accessType });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to determine access type' });
  }
});

router.post('/generate', authenticate, dualAuth, upload.single('logo'), async (req, res) => {
  try {
    const { template, isPreview, ...formData } = req.body;
    const templateConfig = templates[template];
    if (!templateConfig) {
      return res.status(400).json({ error: 'Invalid template' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    let isPremium = true; // or: user.plan === 'premium';

    if (templateConfig.premiumOnly && !isPremium) {
      return res.status(403).json({ error: 'This template is available for premium users only.' });
    }

    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      const mimeType = req.file.mimetype;

      if (ext === '.svg' || mimeType === 'image/svg+xml') {
        // Embed raw SVG XML
        const svgContent = fs.readFileSync(req.file.path, 'utf8');
        formData.logo = svgContent;
        formData.logoType = 'svg';
      } else {
        // Resize image with sharp then base64 encode
        const resizedBuffer = await sharp(req.file.path)
          .resize({ width: 300, withoutEnlargement: true })
          .toBuffer();
        formData.logo = `data:${mimeType};base64,${resizedBuffer.toString('base64')}`;
        formData.logoType = 'img';
      }
    } else {
      formData.logo = null;
      formData.logoType = null;
    }

    // Parse items string into array if needed
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

    // Parse ingredients and instructions if string
    if (typeof formData.ingredients === 'string') {
      formData.ingredients = formData.ingredients.split(/[,;\n]+/).map(i => i.trim()).filter(Boolean);
    }
    if (typeof formData.instructions === 'string') {
      formData.instructions = formData.instructions.split(/[,;\n]+/).map(i => i.trim()).filter(Boolean);
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

    if (!isPreview) {
      if (user.usageCount + pageCount > user.maxUsage) {
        fs.unlinkSync(pdfPath);
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(403).json({
          error: 'Monthly usage limit reached. Upgrade to premium for more pages.',
        });
      }
      user.usageCount += pageCount;
      await user.save();
    }

    if (req.file) {
      fs.unlinkSync(req.file.path);
    }

    res.download(pdfPath, (err) => {
      if (err) {
        console.error('Error sending PDF:', err);
      }
      fs.unlinkSync(pdfPath);
    });

  } catch (err) {
    console.error('PDF generation error:', err);
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

module.exports = router;
