const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');

  
function generateRecipeHtml(data) {
    return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
  <meta charset="UTF-8" />
  <title>${data.recipeName || 'Recipe'}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@700&family=Open+Sans&display=swap');
  
    body {
      font-family: 'Open Sans', sans-serif;
      max-width: 720px;
      margin: 40px auto;
      padding: 30px 40px;
      background: #fff;
      color: #333;
      line-height: 1.6;
      box-shadow: 0 4px 15px rgba(0,0,0,0.1);
      border-radius: 10px;
      border: 1px solid #eee;
      position: relative;
      overflow: hidden;
    }
  
    /* Pale Food Trek logo watermark */
body::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: 400px;
  height: 400px;
  background: url('https://food-trek.com/wp-content/uploads/2025/01/Food-e1738851342880.png') no-repeat center;
  background-size: contain;
  opacity: 0.07;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 0;
}
  
    h1 {
      font-family: 'Merriweather', serif;
      font-weight: 700;
      font-size: 2.8rem;
      color: #e65100;
      margin-bottom: 30px;
      position: relative;
      z-index: 1;
      user-select: text;
    }
  
    .meta-container {
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
      position: relative;
      z-index: 1;
    }
  
    .meta-item {
      background: #fff;
      padding: 20px 25px;
      border-radius: 14px;
      box-shadow: 0 6px 15px rgba(230, 81, 0, 0.25);
      flex: 1 1 140px;
      min-width: 140px;
      cursor: default;
      user-select: none;
      transition: box-shadow 0.3s ease;
    }
    .meta-item:hover {
      box-shadow: 0 8px 25px rgba(230, 81, 0, 0.4);
    }
  
    .meta-item .label {
      font-family: 'Merriweather', serif;
      font-weight: 700;
      font-size: 1.05rem;
      color: #bf360c;
      margin-bottom: 5px;
      user-select: text;
    }
  
    .meta-item .value {
      font-weight: 400;
      font-size: 1.25rem;
      color: #3e2723;
      user-select: text;
      white-space: nowrap;
    }
  
    .description {
      margin-top: 30px;
      font-size: 1.15rem;
      font-style: italic;
      color: #555;
      white-space: pre-wrap;
      position: relative;
      z-index: 1;
    }
  
    h2 {
      font-family: 'Merriweather', serif;
      font-weight: 700;
      font-size: 1.85rem;
      color: #bf360c;
      margin: 50px 0 18px 0;
      border-bottom: 2px solid #ffab91;
      padding-bottom: 6px;
      position: relative;
      z-index: 1;
    }
  
    ul.ingredients {
      list-style-type: disc;
      padding-left: 28px;
      font-size: 1.1rem;
      color: #444;
      position: relative;
      z-index: 1;
    }
  
    ol.instructions {
      padding-left: 28px;
      font-size: 1.1rem;
      color: #444;
      margin-bottom: 40px;
      position: relative;
      z-index: 1;
    }
  
    ol.instructions li {
      margin-bottom: 16px;
    }
  
    .images {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 40px;
      justify-content: center;
      position: relative;
      z-index: 1;
    }
  
    .images img {
      width: 130px;
      height: 95px;
      object-fit: cover;
      border-radius: 12px;
      box-shadow: 0 5px 15px rgba(0,0,0,0.12);
      user-select: none;
    }
  
    @media print {
      body {
        box-shadow: none;
        border: none;
        margin: 0;
        padding: 0;
        max-width: 100%;
        color: #000;
      }
      body::before {
        display: none;
      }
      .images img {
        width: 100%;
        height: auto;
        margin-bottom: 20px;
        box-shadow: none;
        border-radius: 0;
      }
      h1, h2 {
        color: #000;
        border-color: #000;
      }
      .meta-item {
        box-shadow: none !important;
        background: none !important;
      }
      .meta-item .label, .meta-item .value, .description {
        color: #000 !important;
      }
    }
  </style>
  </head>
  <body>
    <h1>${data.recipeName || 'Recipe'}</h1>
  
    <div class="meta-container">
      ${
        data.prepTime
          ? `<div class="meta-item"><div class="label">Prep Time:</div><div class="value">${data.prepTime}</div></div>`
          : ''
      }
      ${
        data.cookTime
          ? `<div class="meta-item"><div class="label">Cook Time:</div><div class="value">${data.cookTime}</div></div>`
          : ''
      }
      ${
        data.restTime
          ? `<div class="meta-item"><div class="label">Rest Time:</div><div class="value">${data.restTime}</div></div>`
          : ''
      }
      ${
        data.totalTime
          ? `<div class="meta-item"><div class="label">Total Time:</div><div class="value">${data.totalTime}</div></div>`
          : ''
      }
      ${
        data.difficulty
          ? `<div class="meta-item"><div class="label">Difficulty:</div><div class="value">${data.difficulty}</div></div>`
          : ''
      }
      ${
        data.servings
          ? `<div class="meta-item"><div class="label">Servings:</div><div class="value">${data.servings}</div></div>`
          : ''
      }
    </div>
  
    ${data.description ? `<p class="description">${data.description}</p>` : ''}
  
    ${
      data.ingredients && data.ingredients.length
        ? `<h2>Ingredients</h2>
        <ul class="ingredients">
          ${data.ingredients.map(i => `<li>${i}</li>`).join('')}
        </ul>`
        : ''
    }
  
    ${
      data.instructions && data.instructions.length
        ? `<h2>Instructions</h2>
        <ol class="instructions">
          ${data.instructions.map(i => `<li>${i}</li>`).join('')}
        </ol>`
        : ''
    }
  
    ${
      data.imageUrls && data.imageUrls.length
        ? `<div class="images">
          ${data.imageUrls
            .map(
              (img) =>
                `<img src="${img}" alt="Recipe image" loading="lazy" />`
            )
            .join('')}
        </div>`
        : ''
    }
  </body>
  </html>
    `;
  }
  
  
  
router.post('/premium-recipe', async (req, res) => {
    const { email, ...data } = req.body;
  
    try {
      const bypassPayment = true; // ⬅️ Set to false later when re-enabling Stripe
  
      // ⛔️ Skip payment check if bypassPayment is true
      if (!bypassPayment) {
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
            success_url: `${process.env.BASE_URL}/${process.env.SUCCESS_URL}?email=${encodeURIComponent(email)}`,
            cancel_url: `${process.env.BASE_URL}/${process.env.CANCEL_URL}`,
          });
  
          return res.status(402).json({ checkoutUrl: session.url });
        }
      }
  
      const html = generateRecipeHtml(data);
      const fileName = `foodtrek_recipe_${Date.now()}.pdf`;
      const pdfDir = path.join(__dirname, '../../pdfs');
if (!fs.existsSync(pdfDir)) {
  fs.mkdirSync(pdfDir, { recursive: true });
}
const pdfPath = path.join(pdfDir, fileName);

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle0' });
await page.pdf({ path: pdfPath, format: 'A4' });
await browser.close();
      res.download(pdfPath, fileName, err => {
        if (err) console.error(err);
        fs.unlinkSync(pdfPath);
      });
    } catch (err) {
      console.error('PDF generation failed:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });
  

module.exports = router;

