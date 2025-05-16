const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');

// Use Twemoji CDN to replace emojis in strings with inline images
function replaceEmojisWithImages(str) {
    // Escape HTML special chars to avoid injection
    function escapeHtml(text) {
      return text.replace(/[&<>"']/g, m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[m]);
    }
    
    // Twemoji CDN base
    const baseUrl = 'https://twemoji.maxcdn.com/v/latest/svg/';
  
    // Convert emoji to hex codepoint strings
    // This regex matches all emojis (surrogate pairs)
    const regexEmoji = /(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/gu;
  
    // Replace each emoji char with img tag
    return escapeHtml(str).replace(regexEmoji, (emoji) => {
      // Get codepoints as hex separated by '-'
      const codePoints = [...emoji].map(c => c.codePointAt(0).toString(16)).join('-');
      // Return <img> referencing Twemoji SVG icon
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
            gap: 30px 25px;
            font-size: 1rem;
            color: #666;
            margin-bottom: 25px;
            font-style: normal;
          }
          .meta-item {
            min-width: 80px;
            text-align: center;
            line-height: 1.2;
            font-weight: 400;
            color: #555;
            user-select: none;
          }
          .meta-item .label {
            font-weight: 700;
            font-size: 0.9rem;
            color: #bf360c;
            margin-bottom: 2px;
            display: block;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-family: 'Merriweather', serif;
          }
          .meta-item .value {
            font-weight: 600;
            font-size: 1.15rem;
            color: #3e2723;
          }
          .description {
            margin-bottom: 30px;
            font-size: 1.1rem;
            font-style: italic;
            color: #555;
            white-space: pre-wrap;
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
            gap: 10px;
            margin-top: 30px;
            justify-content: center;
          }
          .images img {
            width: 140px;
            height: 100px;
            object-fit: cover;
            border-radius: 10px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          }
          .emoji {
            vertical-align: text-bottom;
            width: 1.1em;
            height: 1.1em;
            margin-left: 3px;
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
            .meta {
              color: #000;
            }
            .meta-item .label {
              color: #000;
            }
            .meta-item .value {
              color: #000;
            }
          }
        </style>
      </head>
      <body>
        <h1>${data.recipeName || 'Recipe'}</h1>
  
        <div class="meta">
          ${data.prepTime ? `<div class="meta-item"><span class="label">${replaceEmojisWithImages('⏲️<br>')}</span><span class="value">${data.prepTime}</span></div>` : ''}
          ${data.cookTime ? `<div class="meta-item"><span class="label">${replaceEmojisWithImages('🔥<br>Cook Time')}</span><span class="value">${data.cookTime}</span></div>` : ''}
          ${data.restTime ? `<div class="meta-item"><span class="label">${replaceEmojisWithImages('🛌<br>Rest Time')}</span><span class="value">${data.restTime}</span></div>` : ''}
          ${data.totalTime ? `<div class="meta-item"><span class="label">${replaceEmojisWithImages('⏳<br>Total Time')}</span><span class="value">${data.totalTime}</span></div>` : ''}
          ${data.difficulty ? `<div class="meta-item"><span class="label">${replaceEmojisWithImages('🌶️<br>Difficulty')}</span><span class="value">${data.difficulty}</span></div>` : ''}
          ${data.servings ? `<div class="meta-item"><span class="label">${replaceEmojisWithImages('🍽️<br>Servings')}</span><span class="value">${data.servings}</span></div>` : ''}
        </div>
  
        ${data.description ? `<p class="description">${data.description}</p>` : ''}
  
        ${data.ingredients?.length ? `
          <h2>${replaceEmojisWithImages('📝 Ingredients')}</h2>
          <ul class="ingredients">
            ${data.ingredients.map(ingredient => `<li>${ingredient}</li>`).join('')}
          </ul>
        ` : ''}
  
        ${data.instructions?.length ? `
          <h2>${replaceEmojisWithImages('👩‍🍳 Instructions')}</h2>
          <ol class="instructions">
            ${data.instructions.map(step => `<li>${step}</li>`).join('')}
          </ol>
        ` : ''}
  
        ${data.imageUrls?.length ? `
          <h2>${replaceEmojisWithImages('📸 Images')}</h2>
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

