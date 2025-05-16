const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');


function generateRecipeHtml(data) {
    return `
    <html>
    <head>
      <meta charset="UTF-8" />
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@300;700&family=Open+Sans&display=swap');
  
        /* Reset */
        body, html {
          margin: 0; padding: 0;
          background: #fff;
          font-family: 'Open Sans', sans-serif;
          position: relative;
          color: #333;
        }
  
        /* Watermark */
        body::before {
          content: "";
          position: fixed;
          top: 50%;
          left: 50%;
          width: 400px;
          height: 200px;
          background: url('https://food-trek.com/wp-content/uploads/2025/02/logo-1-18x9.jpg') no-repeat center;
          background-size: contain;
          opacity: 0.06;
          transform: translate(-50%, -50%);
          pointer-events: none;
          z-index: 0;
        }
  
        .container {
          max-width: 720px;
          margin: 40px auto;
          padding: 30px 40px;
          background: #fff;
          box-shadow: 0 4px 15px rgba(0,0,0,0.1);
          border-radius: 12px;
          position: relative;
          z-index: 1;
        }
  
        h1 {
          font-family: 'Merriweather', serif;
          font-weight: 700;
          font-size: 2.8rem;
          color: #e65100;
          margin-bottom: 20px;
          border-bottom: 3px solid #ff7043;
          padding-bottom: 8px;
        }
  
        /* Meta info section with button style */
        .meta-info {
          display: flex;
          gap: 20px;
          flex-wrap: wrap;
          margin-bottom: 30px;
        }
  
        .meta-item {
          background: #fff3e0;
          box-shadow: 0 4px 10px rgba(255, 152, 0, 0.3);
          border-radius: 8px;
          padding: 10px 18px;
          min-width: 110px;
          text-align: center;
          cursor: default;
          user-select: none;
          font-weight: 600;
          color: #bf360c;
          box-sizing: border-box;
        }
  
        .meta-item .label {
          display: block;
          font-size: 0.9rem;
          font-weight: 700;
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 1.3px;
          color: #e65100;
        }
  
        .meta-item .value {
          font-size: 1.1rem;
          font-weight: 400;
          color: #4e342e;
        }
  
        /* Cards for sections */
        section.card {
          background: #fff8e1;
          border-radius: 12px;
          box-shadow: 0 6px 18px rgba(255, 183, 77, 0.3);
          padding: 25px 30px;
          margin-bottom: 35px;
        }
  
        section.card h2 {
          font-family: 'Merriweather', serif;
          font-weight: 700;
          font-size: 1.9rem;
          color: #bf360c;
          border-bottom: 2px solid #ffab91;
          padding-bottom: 8px;
          margin-bottom: 20px;
        }
  
        /* Ingredients list */
        ul.ingredients {
          list-style-type: disc;
          padding-left: 25px;
          font-size: 1.1rem;
          color: #4e342e;
        }
  
        /* Instructions list */
        ol.instructions {
          padding-left: 25px;
          font-size: 1.1rem;
          color: #4e342e;
        }
  
        ol.instructions li {
          margin-bottom: 14px;
        }
  
        /* Images container */
        .images {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          justify-content: center;
          margin-top: 20px;
        }
  
        .images img {
          max-width: 30%;
          border-radius: 10px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          object-fit: cover;
          transition: transform 0.3s ease;
        }
  
        .images img:hover {
          transform: scale(1.05);
        }
  
        /* Print adjustments */
        @media print {
          body::before {
            opacity: 0.03;
          }
          .container {
            box-shadow: none;
            border-radius: 0;
            margin: 0;
            padding: 0 15px;
            max-width: 100%;
          }
          .images img {
            max-width: 100%;
            margin-bottom: 20px;
            box-shadow: none;
            border-radius: 0;
          }
          h1, section.card h2 {
            color: #000;
            border-color: #666;
          }
          .meta-item {
            background: #eee;
            box-shadow: none;
            color: #000;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>${data.recipeName || 'Recipe'}</h1>
  
        <div class="meta-info">
          ${data.prepTime && data.prepTime.label ? `
            <div class="meta-item">
              <span class="label">${replaceEmojisWithImages('⏱️ ')}${data.prepTime.label}:</span>
              <span class="value">${data.prepTime.val}</span>
            </div>` : ''}
  
          ${data.cookTime && data.cookTime.label ? `
            <div class="meta-item">
              <span class="label">${replaceEmojisWithImages('🔥 ')}${data.cookTime.label}:</span>
              <span class="value">${data.cookTime.val}</span>
            </div>` : ''}
  
          ${data.totalTime && data.totalTime.label ? `
            <div class="meta-item">
              <span class="label">${replaceEmojisWithImages('⏳ ')}${data.totalTime.label}:</span>
              <span class="value">${data.totalTime.val}</span>
            </div>` : ''}
  
          ${data.restTime && data.restTime.label ? `
            <div class="meta-item">
              <span class="label">${replaceEmojisWithImages('🕒 ')}${data.restTime.label}:</span>
              <span class="value">${data.restTime.val}</span>
            </div>` : ''}
  
          ${data.difficulty && data.difficulty.label ? `
            <div class="meta-item">
              <span class="label">${replaceEmojisWithImages('⭐ ')}${data.difficulty.label}:</span>
              <span class="value">${data.difficulty.val}</span>
            </div>` : ''}
        </div>
  
        ${data.description ? `
          <section class="card description">
            <h2>Description</h2>
            <p>${replaceEmojisWithImages(data.description)}</p>
          </section>
        ` : ''}
  
        ${data.ingredients?.length ? `
          <section class="card ingredients">
            <h2>Ingredients</h2>
            <ul class="ingredients">
              ${data.ingredients.map(ingredient => `<li>${ingredient}</li>`).join('')}
            </ul>
          </section>
        ` : ''}
  
        ${data.instructions?.length ? `
          <section class="card instructions">
            <h2>Instructions</h2>
            <ol class="instructions">
              ${data.instructions.map(step => `<li>${step}</li>`).join('')}
            </ol>
          </section>
        ` : ''}
  
        ${data.imageUrls?.length ? `
          <section class="card images-section">
            <h2>Images</h2>
            <div class="images">
              ${data.imageUrls.map(url => `<img src="${url}" alt="Recipe image" />`).join('')}
            </div>
          </section>
        ` : ''}
      </div>
  
    
       <footer style="margin: 30px auto; text-align: center; font-size: 0.9rem; color: #888;">
        Created with ❤️ by <strong>Food Trek</strong> — Visit 
        <a href="https://food-trek.com" target="_blank" style="color: #ff7043; text-decoration: none;">foodtrek.com</a>
      </footer>
    </body>
    </html>
    `;
  }


  function replaceEmojisWithImages(text) {
    const emojiMap = {
      '⏱️': 'https://twemoji.maxcdn.com/v/latest/72x72/23f1.png',
      '🔥': 'https://twemoji.maxcdn.com/v/latest/72x72/1f525.png',
      '⏳': 'https://twemoji.maxcdn.com/v/latest/72x72/23f3.png',
      '🕒': 'https://twemoji.maxcdn.com/v/latest/72x72/1f552.png',
      '⭐': 'https://twemoji.maxcdn.com/v/latest/72x72/2b50.png'
    };
    return text.split('').map(ch =>
      emojiMap[ch] ? `<img src="${emojiMap[ch]}" style="width:18px;vertical-align:middle;margin-right:4px;">` : ch
    ).join('');
  }


  router.post('/premium-recipe', async (req, res) => {
    const { email, ...data } = req.body;
  
    try {
      const html = generateRecipeHtml(data);
      const fileName = `foodtrek_recipe_${Date.now()}.pdf`;
      const pdfDir = path.join(__dirname, '../../pdfs');
  
      if (!fs.existsSync(pdfDir)) {
        fs.mkdirSync(pdfDir, { recursive: true });
      }
  
      const pdfPath = path.join(pdfDir, fileName);
  
      const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 800, height: 1000 }); 

await page.setContent(html, { waitUntil: 'networkidle0' });
await page.waitForTimeout(500); 

await page.pdf({
  path: pdfPath,
  format: 'A4',
  printBackground: true,
  scale: 1
});

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