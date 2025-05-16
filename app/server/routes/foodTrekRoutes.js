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
        @import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700&family=Open+Sans&display=swap');
  
        body {
          font-family: 'Open Sans', sans-serif;
          max-width: 700px;
          margin: 40px auto;
          padding: 30px 40px;
          background: #fff;
          color: #333;
          line-height: 1.6;
          box-shadow: 0 8px 20px rgba(0,0,0,0.1);
          border-radius: 12px;
          border: 1px solid #eee;
        }
  
        h1 {
          font-family: 'Merriweather', serif;
          font-weight: 700;
          font-size: 2.8rem;
          color: #d35400;
          margin-bottom: 10px;
          border-bottom: 3px solid #f39c12;
          padding-bottom: 8px;
        }
  
        .meta-info {
          display: flex;
          gap: 20px;
          font-size: 1rem;
          color: #666;
          margin: 12px 0 30px 0;
          font-weight: 600;
        }
        .meta-info div {
          flex-shrink: 0;
        }
  
        .description {
          font-style: italic;
          font-size: 1.1rem;
          color: #555;
          margin-bottom: 30px;
        }
  
        h2 {
          font-family: 'Merriweather', serif;
          font-weight: 700;
          font-size: 1.8rem;
          color: #c0392b;
          border-bottom: 2px solid #e74c3c;
          padding-bottom: 6px;
          margin-top: 40px;
          margin-bottom: 16px;
        }
  
        ul.ingredients {
          list-style-type: disc;
          padding-left: 25px;
          font-size: 1.15rem;
          color: #444;
          margin-bottom: 30px;
        }
  
        ol.instructions {
          padding-left: 25px;
          font-size: 1.15rem;
          color: #444;
          margin-bottom: 40px;
        }
  
        ol.instructions li {
          margin-bottom: 18px;
          position: relative;
        }
  
        ol.instructions li img {
          margin-top: 12px;
          max-width: 100%;
          border-radius: 8px;
          box-shadow: 0 4px 10px rgba(0,0,0,0.12);
          display: block;
        }
  
        .footer {
          font-size: 0.85rem;
          color: #999;
          text-align: center;
          border-top: 1px solid #eee;
          padding-top: 16px;
          margin-top: 50px;
          font-family: 'Open Sans', sans-serif;
        }
  
        a {
          color: #2980b9;
          text-decoration: none;
        }
        a:hover {
          text-decoration: underline;
        }
  
        @media print {
          body {
            box-shadow: none;
            border: none;
            margin: 0;
            padding: 0;
            max-width: 100%;
          }
          ol.instructions li img {
            max-width: 100%;
          }
        }
      </style>
    </head>
    <body>
      <h1>${data.recipeName || 'Recipe'}</h1>
  
      <div class="meta-info">
        ${data.prepTime ? `<div><strong>Prep Time:</strong> ${data.prepTime}</div>` : ''}
        ${data.cookTime ? `<div><strong>Cook Time:</strong> ${data.cookTime}</div>` : ''}
        ${data.totalTime ? `<div><strong>Total Time:</strong> ${data.totalTime}</div>` : ''}
        ${data.difficulty ? `<div><strong>Difficulty:</strong> ${data.difficulty}</div>` : ''}
      </div>
  
      ${data.description ? `<p class="description">${data.description}</p>` : ''}
  
      ${data.ingredients && data.ingredients.length ? `
        <h2>Ingredients</h2>
        <ul class="ingredients">
          ${data.ingredients.map(i => `<li>${i}</li>`).join('')}
        </ul>
      ` : ''}
  
      ${data.instructions && data.instructions.length ? `
        <h2>Instructions</h2>
        <ol class="instructions">
          ${data.instructions.map((step, i) => `
            <li>
              ${step}
              ${data.instructionImages && data.instructionImages[i] ? `<img src="${data.instructionImages[i]}" alt="Step ${i+1} image" />` : ''}
            </li>
          `).join('')}
        </ol>
      ` : ''}
  
      ${data.readOnlineUrl ? `
        <div class="footer">
          Read it online: <a href="${data.readOnlineUrl}">${data.readOnlineUrl}</a>
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

