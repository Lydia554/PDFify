const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');

function generatePremiumRecipeHtml(data) {
    return `
      <html>
        <head>
          <meta charset="UTF-8" />
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@300;700&family=Open+Sans&display=swap');
            body, h1, h2, p, li {
              font-family: 'Open Sans', 'Merriweather', 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif;
            }
            body {
              max-width: 720px;
              margin: 40px auto;
              padding: 40px 50px;
              background: linear-gradient(135deg, #fff8f0, #ffe7d6);
              color: #4a3c31;
              line-height: 1.7;
              box-shadow: 0 8px 25px rgba(0,0,0,0.12);
              border-radius: 18px;
              border: 1px solid #ffb07c;
            }
            h1 {
              font-family: 'Merriweather', serif;
              font-weight: 700;
              font-size: 3.2rem;
              color: #bf360c;
              margin-bottom: 16px;
              border-bottom: 4px solid #ff7043;
              padding-bottom: 10px;
              letter-spacing: 1px;
              text-shadow: 1px 1px 3px rgba(255,112,67,0.6);
            }
            .meta {
              display: flex;
              flex-wrap: wrap;
              gap: 24px;
              font-size: 1.1rem;
              color: #a35d30;
              margin-bottom: 35px;
              font-weight: 600;
            }
            .meta-item {
              background: #ffdcc8;
              padding: 6px 16px;
              border-radius: 20px;
              box-shadow: 0 1px 4px rgba(255,112,67,0.4);
              min-width: 130px;
              text-align: center;
              user-select: none;
            }
            .description {
              margin-bottom: 40px;
              font-size: 1.25rem;
              font-style: italic;
              color: #6b4a2c;
              position: relative;
              padding-left: 40px;
            }
            .description::first-letter {
              font-size: 3.5rem;
              font-weight: 700;
              float: left;
              line-height: 1;
              margin-right: 10px;
              color: #bf360c;
              font-family: 'Merriweather', serif;
              text-shadow: 0 1px 2px rgba(0,0,0,0.1);
            }
            h2 {
              font-family: 'Merriweather', serif;
              font-weight: 700;
              font-size: 2rem;
              color: #d84315;
              margin-bottom: 18px;
              border-bottom: 3px solid #ffab91;
              padding-bottom: 8px;
              margin-top: 50px;
              letter-spacing: 0.5px;
              user-select: none;
            }
            ul.ingredients {
              list-style-type: '🍴';
              list-style-position: inside;
              padding-left: 0;
              font-size: 1.2rem;
              color: #5a3a22;
              margin-bottom: 40px;
            }
            ul.ingredients li {
              margin-bottom: 12px;
              padding-left: 10px;
            }
            ol.instructions {
              padding-left: 25px;
              font-size: 1.2rem;
              color: #5a3a22;
              margin-bottom: 40px;
            }
            ol.instructions li {
              margin-bottom: 16px;
              line-height: 1.5;
              position: relative;
              padding-left: 10px;
            }
            ol.instructions li::marker {
              color: #d84315;
              font-weight: 700;
              font-size: 1.2rem;
            }
            .images {
              display: flex;
              flex-wrap: wrap;
              gap: 30px;
              margin-top: 20px;
              justify-content: center;
            }
            .images img {
              max-width: 48%;
              border-radius: 18px;
              box-shadow: 0 10px 20px rgba(216,67,21,0.3);
              object-fit: cover;
              transition: transform 0.3s ease;
            }
            .images img:hover {
              transform: scale(1.05);
              box-shadow: 0 15px 30px rgba(216,67,21,0.6);
            }
            footer {
              margin-top: 50px;
              font-size: 0.9rem;
              font-style: italic;
              color: #a35d30;
              border-top: 1px solid #ffab91;
              padding-top: 15px;
              text-align: center;
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
                background: #fff;
              }
              .images img {
                max-width: 100%;
                margin-bottom: 20px;
                box-shadow: none;
                border-radius: 0;
                transform: none !important;
              }
              h1, h2, .meta, .description, ul.ingredients, ol.instructions {
                color: #000;
                text-shadow: none;
              }
              footer {
                color: #666;
                border-color: #ccc;
              }
            }
          </style>
        </head>
        <body>
          <h1>${data.recipeName || 'Recipe'} ${data.emojiTitle || ''}</h1>
          
          <div class="meta">
            ${data.prepTime ? `<div class="meta-item">⏱ Prep: ${data.prepTime}</div>` : ''}
            ${data.cookTime ? `<div class="meta-item">🔥 Cook: ${data.cookTime}</div>` : ''}
            ${data.totalTime ? `<div class="meta-item">⌛ Total: ${data.totalTime}</div>` : ''}
            ${data.difficulty ? `<div class="meta-item">💪 Difficulty: ${data.difficulty}</div>` : ''}
            ${data.servings ? `<div class="meta-item">🍽 Servings: ${data.servings}</div>` : ''}
          </div>
          
          ${data.description ? `<p class="description">${data.description}</p>` : ''}
          
          ${data.ingredients?.length ? `
            <h2>Ingredients 🍅</h2>
            <ul class="ingredients">
              ${data.ingredients.map(ingredient => `<li>${ingredient}</li>`).join('')}
            </ul>
          ` : ''}
          
          ${data.instructions?.length ? `
            <h2>Instructions 👩‍🍳</h2>
            <ol class="instructions">
              ${data.instructions.map(step => `<li>${step}</li>`).join('')}
            </ol>
          ` : ''}
          
          ${data.imageUrls?.length ? `
            <h2>Images 📸</h2>
            <div class="images">
              ${data.imageUrls.map(url => `<img src="${url}" alt="Recipe image" />`).join('')}
            </div>
          ` : ''}
          
          <footer>Created with ❤️ by Food Trek — Visit foodtrek.com</footer>
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

