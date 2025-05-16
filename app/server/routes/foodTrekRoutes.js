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
            padding: 30px 40px 60px;
            background: #fff;
            color: #333;
            line-height: 1.6;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            border-radius: 10px;
            border: 1px solid #eee;
            display: flex;
            flex-direction: column;
            min-height: 100vh;
          }
          h1 {
            font-family: 'Merriweather', serif;
            font-weight: 700;
            font-size: 2.8rem;
            color: #e65100;
            margin-bottom: 12px;
            border-bottom: 3px solid #ff7043;
            padding-bottom: 8px;
            user-select: none;
          }
          .meta {
            display: flex;
            flex-wrap: wrap;
            gap: 30px;
            margin-bottom: 25px;
          }
          .meta-item {
            display: flex;
            flex-direction: column;
            min-width: 100px;
            font-style: normal;
            color: #666;
            user-select: none;
          }
          .meta-item > .label {
            font-weight: 700;
            font-size: 0.85rem;
            text-transform: uppercase;
            margin-bottom: 4px;
            letter-spacing: 0.05em;
          }
          .meta-item > .value {
            font-weight: 400;
            font-size: 1.1rem;
            color: #444;
          }
          .description {
            margin-bottom: 30px;
            font-size: 1.15rem;
            font-style: italic;
            color: #555;
            user-select: text;
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
            user-select: none;
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
            gap: 12px;
            margin-top: 20px;
            justify-content: flex-start;
          }
          .images img {
            max-width: 30%;
            border-radius: 12px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            object-fit: cover;
            transition: transform 0.3s ease;
          }
          .images img:hover {
            transform: scale(1.05);
            box-shadow: 0 8px 16px rgba(216,67,21,0.3);
          }
          footer {
            margin-top: auto;
            border-top: 1px solid #ffab91;
            padding-top: 15px;
            text-align: center;
            font-size: 0.9rem;
            font-style: italic;
            color: #a35d30;
            user-select: none;
          }
          /* Emoji fallback: use system font for emojis */
          .emoji {
            font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', 'Segoe UI Symbol', sans-serif;
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
            footer {
              color: #000;
              border-color: #ccc;
            }
          }
        </style>
      </head>
      <body>
        <h1>${data.recipeName ? `${data.recipeName} <span class="emoji">🍽️</span>` : 'Recipe'}</h1>
        
      <div class="meta">
  ${data.prepTime ? `
    <div class="meta-item">
      <div class="label emoji">⏲️ Prep Time</div>
      <div class="value">${data.prepTime}</div>
    </div>` : ''}
  ${data.cookTime ? `
    <div class="meta-item">
      <div class="label emoji">🔥 Cook Time</div>
      <div class="value">${data.cookTime}</div>
    </div>` : ''}
  ${data.totalTime ? `
    <div class="meta-item">
      <div class="label emoji">⏳ Total Time</div>
      <div class="value">${data.totalTime}</div>
    </div>` : ''}
  ${data.restTime ? `
    <div class="meta-item">
      <div class="label emoji">🛌 Rest Time</div>
      <div class="value">${data.restTime}</div>
    </div>` : ''}
  ${data.difficulty ? `
    <div class="meta-item">
      <div class="label emoji">⚙️ Difficulty</div>
      <div class="value">${data.difficulty}</div>
    </div>` : ''}
  ${data.servings ? `
    <div class="meta-item">
      <div class="label emoji">🍽️ Servings</div>
      <div class="value">${data.servings}</div>
    </div>` : ''}
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
        
        <footer>
          © Food Trek — Premium Recipe Print
        </footer>
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

