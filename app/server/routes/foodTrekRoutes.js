const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');
function replaceEmojisWithImages(str) {
    const baseUrl = 'https://twemoji.maxcdn.com/v/latest/svg/';
    const regexEmoji = /(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/gu;
  
    // Escape HTML to avoid injection
    function escapeHtml(text) {
      return text.replace(/[&<>"']/g, m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[m]);
    }
  
    return escapeHtml(str).replace(regexEmoji, (emoji) => {
      const codePoints = [...emoji].map(c => c.codePointAt(0).toString(16)).join('-');
      return `<img class="emoji" draggable="false" alt="${emoji}" src="${baseUrl}${codePoints}.svg" style="width:1.1em; height:1.1em; vertical-align:text-bottom;" />`;
    });
  }
  
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
        background: url('https://food-trek.com/wp-content/uploads/2024/05/food-trek-logo.png') no-repeat center;
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
        margin-bottom: 25px;
        border-bottom: 3px solid #ff7043;
        padding-bottom: 8px;
        position: relative;
        z-index: 1;
      }
  
      .meta-container {
        display: flex;
        flex-wrap: wrap;
        gap: 18px;
        margin-bottom: 30px;
        position: relative;
        z-index: 1;
      }
  
      .meta-item {
        background: #fff;
        padding: 18px 28px;
        border-radius: 16px;
        box-shadow: 0 5px 15px rgba(230, 81, 0, 0.25);
        flex: 1 1 140px;
        text-align: center;
        user-select: none;
        cursor: default;
        transition: box-shadow 0.3s ease;
        min-width: 140px;
      }
      .meta-item:hover {
        box-shadow: 0 7px 25px rgba(230, 81, 0, 0.45);
      }
  
      .meta-item .label {
        font-family: 'Merriweather', serif;
        font-weight: 700;
        font-size: 1rem;
        color: #bf360c;
        margin-bottom: 6px;
        display: block;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        white-space: pre-line;
        line-height: 1.2;
      }
  
      .meta-item .value {
        font-weight: 700;
        font-size: 1.4rem;
        color: #3e2723;
        white-space: nowrap;
        user-select: text;
      }
  
      .description {
        margin-bottom: 40px;
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
        margin-bottom: 14px;
        border-bottom: 2px solid #ffab91;
        padding-bottom: 6px;
        margin-top: 50px;
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
        margin-top: 35px;
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
  
      .emoji {
        vertical-align: text-bottom;
        width: 1.2em;
        height: 1.2em;
        margin-left: 3px;
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
        h1 {
          color: #000;
          border-color: #000;
        }
        h2 {
          color: #000;
          border-color: #666;
        }
        .meta-item {
          box-shadow: none !important;
          background: none !important;
        }
        .meta-item .label, .meta-item .value {
          color: #000 !important;
        }
        .description {
          color: #000 !important;
        }
      }
    </style>
  </head>
  <body>
    <h1>${replaceEmojisWithImages(data.recipeName || 'Recipe')}</h1>
  
    <div class="meta-container">
      ${
        data.prepTime
          ? `<div class="meta-item"><span class="label">PREP TIME</span><span class="value">${replaceEmojisWithImages(data.prepTime)}</span></div>`
          : ''
      }
      ${
        data.cookTime
          ? `<div class="meta-item"><span class="label">COOK TIME</span><span class="value">${replaceEmojisWithImages(data.cookTime)}</span></div>`
          : ''
      }
      ${
        data.restTime
          ? `<div class="meta-item"><span class="label">REST TIME</span><span class="value">${replaceEmojisWithImages(data.restTime)}</span></div>`
          : ''
      }
      ${
        data.totalTime
          ? `<div class="meta-item"><span class="label">TOTAL TIME:</span><span class="value">${replaceEmojisWithImages(data.totalTime)}</span></div>`
          : ''
      }
      ${
        data.difficulty
          ? `<div class="meta-item"><span class="label">DIFFICULTY:</span><span class="value">${replaceEmojisWithImages(data.difficulty)}</span></div>`
          : ''
      }
      ${
        data.servings
          ? `<div class="meta-item"><span class="label">SERVINGS</span><span class="value">${replaceEmojisWithImages(data.servings)}</span></div>`
          : ''
      }
    </div>
  
    ${data.description ? `<p class="description">${replaceEmojisWithImages(data.description)}</p>` : ''}
  
    ${
      data.ingredients && data.ingredients.length
        ? `<h2>Ingredients</h2>
        <ul class="ingredients">
          ${data.ingredients.map(i => `<li>${replaceEmojisWithImages(i)}</li>`).join('')}
        </ul>`
        : ''
    }
  
    ${
      data.instructions && data.instructions.length
        ? `<h2>Instructions</h2>
        <ol class="instructions">
          ${data.instructions.map(i => `<li>${replaceEmojisWithImages(i)}</li>`).join('')}
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

