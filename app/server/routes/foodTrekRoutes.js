const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

function parseEmoji(str) {
  return str || '';
}

function parseArray(arr) {
  return Array.isArray(arr)
    ? arr.map(item => {
        if (typeof item === 'string') {
          return { description: parseEmoji(item) };
        } else {
          return {
            title: parseEmoji(item.title || ''),
            description: parseEmoji(item.description || ''),
          };
        }
      })
    : [];
}
function cleanTimeField(rawValue, expectedLabel) {
  if (!rawValue || typeof rawValue !== 'string') {
    return { label: expectedLabel, val: '' };
  }

 
  const cleaned = rawValue.replace(/\s+/g, ' ').trim();


  const match = cleaned.match(/(\d+\s*(mins?|hours?|hr|h|sec|s))/i);

  return {
    label: expectedLabel,
    val: match ? match[1] : cleaned 
  };
}





function generateRecipeHtml(data) {
  const parsedData = {
    ...data,
    recipeName: parseEmoji(data.recipeName),
    description: parseEmoji(data.description),
    ingredients: parseArray(data.ingredients),
    instructions: parseArray(data.instructions),
    metaTimes: Array.isArray(data.metaTimes) ? data.metaTimes.map(parseEmoji) : [],
    prepTime: cleanTimeField(data.prepTime, "⏰Prep Time"),
    cookTime: cleanTimeField(data.cookTime, "⏰Cook Time"),
    totalTime: cleanTimeField(data.totalTime, "⌛Total Time"),
    restTime: cleanTimeField(data.restTime, "⏱️Rest Time"),
    difficulty: cleanTimeField(data.difficulty, "Difficulty"),
    servings: parseEmoji(data.servings),
    scaleIngredients: parseArray(data.scaleIngredients),
  };
  

  const cleanedDescription = parsedData.description?.replace(/^Description[:\s]*/i, '');


  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8" />
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@300;700&family=Open+Sans&display=swap');
      
      body, html {
        margin: 0;
        padding: 0;
        background: #fff;
        font-family: 'Open Sans', 'Merriweather', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;

        color: #333;
      }



.step-description {
  font-size: 0.95rem;
  color: #4e342e;
  font-weight: 400;
  text-align: left;
  white-space: pre-wrap; /* preserve line breaks */
}


      header.logo-header {
        text-align: center;
        padding: 5px 0 10px;
        border-bottom: 1px solid #eee;
      }

      header.logo-header img {
        max-width: 150px;
        height: auto;
      }

      .container {
        max-width: 300px;
        margin: 30px auto;
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

      .meta-info {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 30px;
      }

      .meta-item {
        background: #fff3e0;
        box-shadow: 0 4px 10px rgba(255, 152, 0, 0.3);
        border-radius: 8px;
        padding: 5px 5px;
        min-width: 70px;
        text-align: center;
        font-weight: 600;
        color: #bf360c;
      }

      .meta-item .label {
  font-weight: 700; /* bold label */
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #e65100;
}

      .meta-item .value {
        font-size: 1.1rem;
        font-weight: 400;
        color: #4e342e;
      }

      section.card {
        background: #fff;
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

      ul.ingredients, ol.instructions {
        padding-left: 25px;
        font-size: 1.1rem;
        color: #4e342e;
      }

      ol.instructions li {
        margin-bottom: 14px;
      }



      .images {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        justify-content: center;
        margin-top: 5px;
      }

      .images img {
        max-width: 20%;
        border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        transition: transform 0.3s ease;
      }

      .images img:hover {
        transform: scale(1.05);
      }

     .images-with-steps {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
      justify-content: center;
    }

    
          .image-step-pair {
      flex: 1 1 150px;
      max-width: 200px;
      text-align: center;
        background: #fff8f1;
  padding: 10px;
  border-radius: 10px;
  box-shadow: 0 2px 6px rgba(255,183,77,0.15);
      
    }

    .image-step-pair img {
      max-width: 100%;
      border-radius: 10px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      transition: transform 0.3s ease;
    }

    .image-step-pair img:hover {
      transform: scale(1.05);
    }


      footer {
        text-align: center;
        margin: 30px auto;
        font-size: 0.9rem;
        color: #888;
      }

      @media print {
        body, html {
          margin: 0;
          padding: 0;
        }

        header.logo-header {
          position: running(header-logo);
          display: block;
          text-align: center;
          margin-bottom: 10px;
        }

        @page {
          margin-top: 100px;
          margin-bottom: 60px;
          @top-center {
            content: element(header-logo);
          }
        }

        .container {
          box-shadow: none;
          border-radius: 0;
          margin: 0;
          padding: 0 15px;
          max-width: 100%;
        }

        .images img {
          max-width: 50%;
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
  <header class="logo-header" id="header-logo">
    <img src="https://food-trek.com/wp-content/uploads/2025/02/logo-1.jpg" alt="Food Trek Logo" />
  </header>


  <div class="container">
    <h1>🍽️${parsedData.recipeName || 'Recipe'}</h1>


<div class="meta-info">
  <div class="meta-item">
    <span class="label">${parsedData.prepTime.label}</span>
    <span class="value">${parsedData.prepTime.val}</span>
  </div>
  <div class="meta-item">
    <span class="label">${parsedData.cookTime.label}</span>
    <span class="value">${parsedData.cookTime.val}</span>
  </div>
  <div class="meta-item">
    <span class="label">${parsedData.totalTime.label}</span>
    <span class="value">${parsedData.totalTime.val}</span>
  </div>
  <div class="meta-item">
    <span class="label">${parsedData.restTime.label}</span>
    <span class="value">${parsedData.restTime.val}</span>
  </div>
  <div class="meta-item">
    <span class="label">Servings</span>
    <span class="value">${parsedData.servings || 'N/A'}</span>

  </div>
  <div class="meta-item">
    <span class="value">${parsedData.difficulty.val}</span>
  </div>
</div>


${cleanedDescription ? `<section class="card"><h2>Description</h2><p class="main-description">${cleanedDescription}</p></section>` : ''}

  ${parsedData.ingredients.length ? `<section class="card"><h2>🔪🥩🍅Ingredients</h2><ul class="ingredients">${parsedData.ingredients.map(i => `<li>${i.description || i}</li>`).join('')}</ul></section>` : ''}

  ${parsedData.scaleIngredients?.length ? `
    <section class="card">
      <h2>Ingredients for Different Servings</h2>
      <ul class="scaled-ingredients">
        ${parsedData.scaleIngredients.map(i => `<li>${i}</li>`).join('')}
      </ul>
    </section>
  ` : ''}

  ${parsedData.imageUrls?.length ? `
    <section class="card">
      <h2>👩‍🍳🍳Instructions</h2>
      <div class="images-with-steps">
        ${parsedData.imageUrls.map((url, i) => {
          const step = parsedData.instructions[i] || {};
          return `
            <div class="image-step-pair">
              <img src="${url}" alt="Step ${i + 1}" />
              ${step.title ? `<div class="step-title">${step.title}</div>` : ''}
              ${step.description ? `<div class="step-description">${step.description}</div>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </section>
  ` : ''}
</div>


   <footer>
    Created with 💙 by <strong>Food Trek</strong> — <a href="https://food-trek.com" style="color:#ff7043; text-decoration:none;">food-trek.com</a>
  </footer>
  </body>
  </html>`;
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
    await page.setContent(html, { waitUntil: 'networkidle0' });


    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: false,
      scale: 1,
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
