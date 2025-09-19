const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const { PDFDocument } = require("pdf-lib");
const { incrementUsage } = require("../utils/usageUtils");
const { postProcessPdfStrict } = require("../utils/postProcessPdfStrict");
const { generateZugferdXML } = require("../utils/zugferdHelper");
const User = require('../models/User');
const authenticate = require('../middleware/authenticate');
const dualAuth = require("../middleware/dualAuth");

// Convert image file to Base64
const convertToBase64 = async (filePath) => {
  const buffer = await fs.promises.readFile(filePath);
  const ext = path.extname(filePath).slice(1);
  return `data:image/${ext};base64,${buffer.toString('base64')}`;
};

const invoiceTemplate = require('../templates-friendly-mode/invoice');
const invoiceTemplatePremium = require('../templates-friendly-mode/invoice-premium');
const recipeTemplateBasic = require('../templates-friendly-mode/recipe');
const recipeTemplatePremium = require('../templates-friendly-mode/recipe-premium');

const templates = {
  invoice: { fn: (isPremium) => isPremium ? invoiceTemplatePremium : invoiceTemplate, premiumOnly: false },
  recipe: { fn: (isPremium) => isPremium ? recipeTemplatePremium : recipeTemplateBasic, premiumOnly: false },
};

const FORCE_PLAN = process.env.FORCE_PLAN;

router.post('/generate', authenticate, dualAuth, async (req, res) => {
  const { template, isPreview, ...formData } = req.body;
  const templateConfig = templates[template];
  if (!templateConfig) return res.status(400).json({ error: 'Invalid template' });

  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const plan = FORCE_PLAN?.trim() || user.planType || 'free';
    const isPremiumAccess = ['premium', 'pro'].includes(plan);
    const isPremiumRender = isPremiumAccess || user.isPremium;

    if (templateConfig.premiumOnly && !isPremiumAccess) {
      return res.status(403).json({ error: 'This template is available for premium users only.' });
    }

    if (!isPremiumAccess) formData.logoBase64 = null;

    // Normalize ingredients/instructions/items
    if (typeof formData.ingredients === 'string') formData.ingredients = formData.ingredients.split(/[,;\n]+/).map(i => i.trim()).filter(Boolean);
    if (typeof formData.instructions === 'string') formData.instructions = formData.instructions.split(';').map(i => i.trim()).filter(Boolean);

    // Convert images to Base64 for PDF rendering
    if (Array.isArray(formData.imageUrls)) {
      for (let i = 0; i < formData.imageUrls.length; i++) {
        formData.imageUrls[i] = await convertToBase64(formData.imageUrls[i]);
      }
    }

    // Generate HTML with Base64 images
    const generateHtml = templateConfig.fn(isPremiumRender);
    const html = generateHtml(formData);

    // Generate PDF using Puppeteer
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4' });
    await browser.close();

    // Count usage
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pageCount = pdfDoc.getPageCount();
    const usageAllowed = await incrementUsage(user, pageCount, isPreview, plan);
    if (!usageAllowed) {
      return res.status(403).json({ error: 'Monthly usage limit reached. Upgrade to premium for more pages.' });
    }

    // PRO invoice processing
    let finalBuffer = pdfBuffer;
    if (template === 'invoice' && plan === 'pro') {
      const zugferdXml = generateZugferdXML(formData);
      const xmpTemplatePath = path.resolve(__dirname, "../server/xmp/zugferd.xmp");
      finalBuffer = await postProcessPdfStrict(pdfBuffer, zugferdXml, {
        title: 'Invoice',
        creator: 'PDFify',
        language: formData.language || 'en'
      }, xmpTemplatePath);
    }

    // Send PDF (preview inline, download normally)
    if (isPreview) {
      res.setHeader('Content-Type', 'application/pdf');
      return res.send(finalBuffer);
    } else {
      const pdfDir = path.join(__dirname, '../../pdfs');
      if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
      const pdfPath = path.join(pdfDir, `pdf_${Date.now()}.pdf`);
      fs.writeFileSync(pdfPath, finalBuffer);
      res.download(pdfPath, err => fs.unlinkSync(pdfPath));
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

module.exports = router;
