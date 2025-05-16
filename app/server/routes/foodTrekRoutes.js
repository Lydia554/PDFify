const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');

function generateRecipeHtml(data) {
    return `
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@300;700&family=Open+Sans&display=swap');
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
          }
          h1 {
            font-family: 'Merriweather', serif;
            font-weight: 700;
            font-size: 2.8rem;
            color: #e65100;
            margin-bottom: 12px;
            border-bottom: 3px solid #ff7043;
            padding-bottom: 8px;
          }
          .meta {
            display: flex;
            flex-wrap: wrap;
            gap: 20px;
            font-size: 1rem;
            color: #666;
            margin-bottom: 25px;
            font-style: normal;
          }
          .meta-item {
            font-weight: 600;
            min-width: 120px;
          }
          .description {
            margin-bottom: 30px;
            font-size: 1.1rem;
            font-style: italic;
            color: #555;
          }
          h2 {
            font-family: 'Merriweather', serif;
            font-weight: 700;
            font-size: 1.8rem;
            color: #bf360c;
            margin-bottom: 12px;
            border-bottom: 2px solid #ffab91;
            padding-bottom: 6px;
            margin-top: 40px;
          }
          ul.ingredients {
            list-style-type: disc;
            padding-left: 25px;
            font-size: 1.1rem;
            color: #444;
          }
          ol.instructions {
            padding-left: 25px;
            font-size: 1.1rem;
            color: #444;
            margin-bottom: 30px;
          }
          ol.instructions li {
            margin-bottom: 14px;
          }
          .images {
            display: flex;
            flex-wrap: wrap;
            gap: 20px;
            margin-top: 30px;
            justify-content: center;
          }
          .images img {
            max-width: 45%;
            border-radius: 10px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            object-fit: cover;
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
            .images img {
              max-width: 100%;
              margin-bottom: 20px;
              box-shadow: none;
              border-radius: 0;
            }
            h1 {
              color: #000;
              border-color: #000;
            }
            h2 {
              color: #000;
              border-color: #666;
            }
            .meta {
              color: #000;
            }
          }
        </style>
      </head>
      <body>
        <h1>${data.recipeName || 'Recipe'}</h1>
        
        <div class="meta">
          ${data.prepTime ? `<div class="meta-item"><strong>Prep Time:</strong> ${data.prepTime}</div>` : ''}
          ${data.cookTime ? `<div class="meta-item"><strong>Cook Time:</strong> ${data.cookTime}</div>` : ''}
          ${data.totalTime ? `<div class="meta-item"><strong>Total Time:</strong> ${data.totalTime}</div>` : ''}
          ${data.difficulty ? `<div class="meta-item"><strong>Difficulty:</strong> ${data.difficulty}</div>` : ''}
          ${data.servings ? `<div class="meta-item"><strong>Servings:</strong> ${data.servings}</div>` : ''}
        </div>
        
        ${data.description ? `<p class="description">${data.description}</p>` : ''}
        
        ${data.ingredients?.length ? `
          <h2>Ingredients</h2>
          <ul class="ingredients">
            ${data.ingredients.map(ingredient => `<li>${ingredient}</li>`).join('')}
          </ul>
        ` : ''}
        
        ${data.instructions?.length ? `
          <h2>Instructions</h2>
          <ol class="instructions">
            ${data.instructions.map(step => `<li>${step}</li>`).join('')}
          </ol>
        ` : ''}
        
        ${data.imageUrls?.length ? `
          <h2>Images</h2>
          <div class="images">
            ${data.imageUrls.map(url => `<img src="${url}" alt="Recipe image" />`).join('')}
          </div>
        ` : ''}
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

