const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User'); // if you're tracking premium users

function generateRecipeHtml(data) {
  return `
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; }
        h1 { color: #ff5722; }
        ul { padding-left: 20px; }
        img { max-width: 100%; margin: 10px 0; border-radius: 8px; }
        .section { margin-top: 20px; }
      </style>
    </head>
    <body>
      <h1>${data.recipeName}</h1>
      ${data.includePrepTime ? `<p><strong>Prep Time:</strong> ${data.prepTime}</p>` : ''}
      ${data.description ? `<p><em>${data.description}</em></p>` : ''}
      ${data.includeIngredients ? `
        <div class="section">
          <h2>Ingredients</h2>
          <ul>${data.ingredients.map(i => `<li>${i}</li>`).join('')}</ul>
        </div>` : ''}
      ${data.includeInstructions ? `
        <div class="section">
          <h2>Instructions</h2>
          <ol>${data.instructions.map(i => `<li>${i}</li>`).join('')}</ol>
        </div>` : ''}
      ${data.imageUrls?.length ? `
        <div class="section">
          <h2>Images</h2>
          ${data.imageUrls.map(url => `<img src="${url}" />`).join('')}
        </div>` : ''}
    </body>
    </html>
  `;
}

router.post('/premium-recipe', async (req, res) => {
  const { email, ...data } = req.body;

  // Check premium user
  const user = await User.findOne({ email });

  if (!user || !user.isPremium) {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{
        price: process.env.STRIPE_PREMIUM_PRICE_ID,
        quantity: 1,
      }],
      success_url: 'https://your-api-domain.com/premium-success?email=' + encodeURIComponent(email),
      cancel_url: 'https://your-site.com/premium-cancelled',
    });

    return res.status(402).json({ checkoutUrl: session.url });
  }

  try {
    const html = generateRecipeHtml(data);
    const pdfPath = path.join(__dirname, '../../pdfs', `foodtrek_recipe_${Date.now()}.pdf`);

    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({ path: pdfPath, format: 'A4' });
    await browser.close();

    res.download(pdfPath, err => {
      if (err) console.error(err);
      fs.unlinkSync(pdfPath);
    });
  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

module.exports = router;
