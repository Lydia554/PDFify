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

router.post('/premium-recipe', async (req, res) => {
  const { email, ...data } = req.body;

  const user = await User.findOne({ email });

  if (!user || !user.isPremium) {
    // Not a premium user → create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{
        price: process.env.STRIPE_PREMIUM_PRICE_ID,
        quantity: 1,
      }],
      success_url: 'https://your-api-domain.com/premium-success?email=' + encodeURIComponent(email),
      cancel_url: 'https://your-site.com/premium-cancelled'
    });

    return res.status(402).json({ checkoutUrl: session.url });
  }

  // Is premium → generate PDF
  const html = generateRecipeHtml(data);
  const pdfPath = path.join(__dirname, '../../pdfs', `recipe_${Date.now()}.pdf`);

  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.pdf({ path: pdfPath, format: 'A4' });
  await browser.close();

  res.download(pdfPath, err => {
    if (err) console.error(err);
    fs.unlinkSync(pdfPath);
  });
});


module.exports = router;
