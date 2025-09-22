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

const { embedIccProfile, embedXmlIntoPdf, generateZugferdXML } = require("../Helpers/pdf-helpers");

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

    // Parse items, ingredients, instructions
    if (typeof formData.items === 'string') {
      formData.items = formData.items.split(/\n|;/).map(row => row.trim()).filter(Boolean)
        .map(row => {
          const [description, quantity, unitPrice] = row.split(',').map(v => v.trim());
          return { description: description || 'Item', quantity: Number(quantity) || 1, unitPrice: Number(unitPrice) || 0 };
        });
    }
    if (typeof formData.ingredients === 'string') {
      formData.ingredients = formData.ingredients.split(/[,;\n]+/).map(i => i.trim()).filter(Boolean);
    }
    if (typeof formData.instructions === 'string') {
      formData.instructions = formData.instructions.split(';').map(i => i.trim()).filter(Boolean);
    }

    // Generate HTML
    const generateHtml = templateConfig.fn(isPremiumRender);
    const html = generateHtml(formData);

    // Generate PDF
    const pdfDir = path.join(__dirname, '../../pdfs');
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
    const pdfPath = path.join(pdfDir, `pdf_${Date.now()}.pdf`);

    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({ path: pdfPath, format: 'A4' });
    await browser.close();

    let pdfBuffer = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pageCount = pdfDoc.getPageCount();

    // Increment usage
    const usageAllowed = await incrementUsage(user, pageCount, isPreview, plan);
    if (!usageAllowed) {
      fs.unlinkSync(pdfPath);
      return res.status(403).json({ error: 'Monthly usage limit reached. Upgrade to premium for more pages.' });
    }

    // --- PRO INVOICES: PDF/A-3b + ZUGFeRD ---
    if (template === 'invoice' && plan === 'pro') {
      await embedIccProfile(pdfDoc); // OutputIntent
      embedXmlIntoPdf(pdfDoc, generateZugferdXML(formData));
      pdfBuffer = await pdfDoc.save();
      fs.writeFileSync(pdfPath, pdfBuffer);
    }

    res.download(pdfPath, err => {
      fs.unlinkSync(pdfPath);
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

module.exports = router;
