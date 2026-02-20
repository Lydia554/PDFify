const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require('puppeteer');
const { PDFDocument } = require("pdf-lib");
const { incrementUsage } = require("../utils/usageUtils");
const User = require('../models/User');
const authenticate = require('../middleware/authenticate');
const dualAuth = require("../middleware/dualAuth");
const { createPdfA3WithJava } = require("../Helpers/pdf-helpers");
const generateZugferdXml = require("../../xml/generateZugferdXml");

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

  const tmpDir = path.join(os.tmpdir(), `pdfify-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  let browser;
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
    let html;
    try {
      html = generateHtml(formData);
    } catch (templateError) {
      console.error('❌ Template generation error:', templateError);
      throw new Error(`Template error: ${templateError.message}`);
    }

    let pdfBuffer;

    // --- PAID invoices: Use Java service for PDF/A-3b + ZUGFeRD ---
    if (template === 'invoice' && (plan === 'pro' || plan === 'premium')) {
      console.log('🚀 [Friendly Mode] Using Java service for PAID invoice (', plan, ')');

      try {
        // Prepare data for Java service
        // Map items to Java service format
        const mappedItems = (formData.items || []).map(item => {
          const qty = Number(item.quantity) || 1;
          const price = Number(item.unitPrice) || 0;
          const net = qty * price;
          const taxRate = Number(formData.taxRate) || 0;
          const tax = net * (taxRate / 100);

          return {
            name: item.description || 'Item',
            price,
            quantity: qty,
            unitCode: 'EA',
            net,
            tax,
            total: net + tax
          };
        });

        // Calculate totals for ZUGFeRD
        const subtotal = mappedItems.reduce((sum, item) => sum + item.net, 0);
        const tax = mappedItems.reduce((sum, item) => sum + item.tax, 0);
        const total = subtotal + tax;
        const taxRate = Number(formData.taxRate) || 0;

        const javaData = {
          orderId: formData.invoiceNumber || `INV-${Date.now()}`,
          date: formData.date || new Date().toISOString().split('T')[0],
          customerName: formData.customerName || 'Customer',
          customerEmail: formData.companyEmail || '',
          customerAddress: formData.recipientAddress || '',
          companyName: formData.companyName || 'Your Company',
          shopName: formData.companyName || '',
          shopAddress: formData.senderAddress || '',
          customLogoUrl: formData.logo || null,
          primaryColor: formData.primaryColor || '#00a6cc',
          items: mappedItems,
          currency: 'EUR',
          language: formData.invoiceLanguage || formData.language || 'en',
          notes: formData.notes || '',
          subtotal,
          tax,
          total,
          taxRate,
          iban: 'DE89370400440532013000',
          sellerAddress: formData.senderAddress || '',
          buyerAddress: formData.recipientAddress || '',
          sellerVatId: 'DE123456789'
        };

        // Generate ZUGFeRD XML
        let zugferdXml;
        try {
          zugferdXml = generateZugferdXml(javaData);
        } catch (xmlError) {
          console.error('❌ [Friendly Mode] ZUGFeRD XML generation failed:', xmlError);
          throw new Error(`ZUGFeRD XML generation failed: ${xmlError.message}`);
        }
        javaData.zugferdXml = zugferdXml;

        console.log('📄 [Friendly Mode] Calling Java service...');
        const filename = `FriendlyInvoice_${javaData.orderId}_${Date.now()}.pdf`;
        pdfBuffer = await createPdfA3WithJava(javaData, filename);
        console.log('✅ [Friendly Mode] Java service PDF generated');

      } catch (javaError) {
        console.error('❌ [Friendly Mode] Java service failed:', javaError.message);
        console.log('⚠️  [Friendly Mode] Falling back to Puppeteer...');

        // Fallback to Puppeteer
        const pdfPath = path.join(tmpDir, `pdf_${Date.now()}.pdf`);
        browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        pdfBuffer = await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
        await browser.close();
      }
    } else {
      // Standard Puppeteer generation for non-Pro or non-invoice templates
      const pdfPath = path.join(tmpDir, `pdf_${Date.now()}.pdf`);
      browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      pdfBuffer = await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
      await browser.close();
    }

    // Page count & usage
    const pdfDocFinal = await PDFDocument.load(pdfBuffer);
    const pageCount = pdfDocFinal.getPageCount();

    const usageAllowed = await incrementUsage(user, pageCount, isPreview, plan);
    if (!usageAllowed) {
      return res.status(403).json({ error: 'Monthly usage limit reached. Upgrade to premium for more pages.' });
    }

    // Save PDF to temp file for download
    const pdfPath = path.join(tmpDir, `friendly_${template}_${Date.now()}.pdf`);
    fs.writeFileSync(pdfPath, pdfBuffer);

    // Send PDF
    res.download(pdfPath, err => {
      fs.unlinkSync(pdfPath);
    });

  } catch (err) {
    console.error("❌ PDF generation failed:", err);
    if (browser) await browser.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    res.status(500).json({ error: 'PDF generation failed', details: err.message });
  } finally {
    if (browser) await browser.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

module.exports = router;
