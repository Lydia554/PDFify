const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');

function generateRecipeHtml(data) {
    // Helper to replace emojis with images (if needed)
    function replaceEmojisWithImages(text) {
      // Add your emoji-to-image logic here, or just return text for now
      return text;
    }
  
    return `
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@300;700&family=Open+Sans&display=swap');
          body {
            font-family: 'Open Sans', sans-serif;
            max-width: 720px;
            margin: 40px auto 80px; /* bottom margin for footer */
            padding: 30px 40px;
            background: #fff;
            color: #333;
            line-height: 1.6;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            border-radius: 10px;
            border: 1px solid #eee;
            position: relative;
            z-index: 1;
          }
          /* Watermark logo */
          body::before {
            content: "";
            position: fixed;
            top: 50%;
            left: 50%;
            width: 350px;
            height: 175px;
            background: url('https://food-trek.com/wp-content/uploads/2025/02/logo-1-18x9.jpg') no-repeat center;
            background-size: contain;
            opacity: 0.06;
            transform: translate(-50%, -50%);
            pointer-events: none;
            z-index: 0;
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
            gap: 15px;
            margin-bottom: 25px;
            font-style: normal;
          }
          .meta-item {
            background: #fff5e6;
            padding: 10px 15px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(255, 112, 67, 0.3);
            min-width: 100px;
            text-align: center;
            font-weight: 600;
            color: #bf360c;
            display: flex;
            flex-direction: column;
            justify-content: center;
            line-height: 1.2;
            font-size: 0.95rem;
            user-select: none;
          }
          .meta-item .label {
            font-weight: 700;
            text-transform: uppercase;
            font-size: 0.85rem;
            margin-bottom: 4px;
            color: #e65100;
          }
          .meta-item .value {
            font-weight: 400;
            text-transform: none;
            color: #4e342e;
          }
          /* Cards for sections */
          .card {
            background: #fff5e6;
            padding: 20px 25px;
            margin-bottom: 30px;
            border-radius: 10px;
            box-shadow: 0 6px 18px rgba(255, 112, 67, 0.2);
            color: #5d4037;
            font-size: 1.1rem;
            line-height: 1.4;
          }
          .card h2 {
            font-family: 'Merriweather', serif;
            font-weight: 700;
            font-size: 1.9rem;
            color: #bf360c;
            margin-bottom: 16px;
            border-bottom: 2px solid #ffab91;
            padding-bottom: 8px;
            user-select: none;
          }
          ul.ingredients {
            list-style-type: disc;
            padding-left: 25px;
            margin: 0;
            color: #4e342e;
          }
          ul.ingredients li {
            margin-bottom: 10px;
          }
          ol.instructions, ol.dr-ordered-list {
            padding-left: 25px;
            margin: 0;
            color: #4e342e;
          }
          ol.instructions li, ol.dr-ordered-list li {
            margin-bottom: 16px;
            line-height: 1.5;
          }
          /* Smaller images, closer together */
          .images {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            margin-top: 20px;
            justify-content: center;
          }
          .images img {
            width: 30%;
            max-width: 180px;
            border-radius: 8px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.08);
            object-fit: cover;
          }
          /* Footer */
          footer {
            position: fixed;
            bottom: 15px;
            left: 0;
            width: 100%;
            text-align: center;
            font-size: 0.85rem;
            color: #aaa;
            font-family: 'Open Sans', sans-serif;
            user-select: none;
            z-index: 10;
          }
          /* Print styling */
          @media print {
            body {
              box-shadow: none;
              border: none;
              margin: 0;
              padding: 0;
              max-width: 100%;
              color: #000;
            }
            .card {
              box-shadow: none;
              background: none;
              padding: 0;
              margin-bottom: 20px;
              color: #000;
            }
            .images img {
              max-width: 100%;
              margin-bottom: 20px;
              box-shadow: none;
              border-radius: 0;
            }
            h1, h2, .meta-item .label {
              color: #000;
              border-color: #000;
            }
            footer {
              color: #444;
              position: fixed;
              bottom: 10px;
              font-size: 0.8rem;
            }
          }
        </style>
      </head>
      <body>
        <h1>${data.recipeName || 'Recipe'}</h1>
  
        <div class="meta">
          ${data.prepTime ? `<div class="meta-item"><span class="label">Prep Time</span><span class="value">${data.prepTime}</span></div>` : ''}
          ${data.cookTime ? `<div class="meta-item"><span class="label">Cook Time</span><span class="value">${data.cookTime}</span></div>` : ''}
          ${data.restTime ? `<div class="meta-item"><span class="label">Rest Time</span><span class="value">${data.restTime}</span></div>` : ''}
          ${data.totalTime ? `<div class="meta-item"><span class="label">Total Time</span><span class="value">${data.totalTime}</span></div>` : ''}
          ${data.difficulty ? `<div class="meta-item"><span class="label">Difficulty</span><span class="value">${data.difficulty}</span></div>` : ''}
          ${data.servings ? `<div class="meta-item"><span class="label">Servings</span><span class="value">${data.servings}</span></div>` : ''}
        </div>
  
        ${data.description ? `
        <div class="card">
          <h2>Description</h2>
          <p>${data.description}</p>
        </div>
        ` : ''}
  
        ${data.ingredients?.length ? `
        <div class="card">
          <h2>Ingredients</h2>
          <ul class="ingredients">
            ${data.ingredients.map(ingredient => `<li>${ingredient}</li>`).join('')}
          </ul>
        </div>
        ` : ''}
  
        ${(data.instructions?.length || data.drOrderedList?.length) ? `
        <div class="card">
          <h2>Instructions</h2>
          <ol class="instructions">
            ${data.instructions?.map(step => `<li>${step}</li>`).join('') || ''}
          </ol>
          <ol class="dr-ordered-list">
            ${data.drOrderedList?.map(step => `<li>${step}</li>`).join('') || ''}
          </ol>
        </div>
        ` : ''}
  
        ${data.imageUrls?.length ? `
        <div class="card">
          <h2>Images</h2>
          <div class="images">
            ${data.imageUrls.map(url => `<img src="${url}" alt="Recipe image" />`).join('')}
          </div>
        </div>
        ` : ''}
  
        <footer>food-trek.com</footer>
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

