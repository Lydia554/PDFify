const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const twemoji = require('twemoji');

// Helper: parse individual text string to twemoji <img> if emoji is found
function parseEmoji(text) {
  return text ? twemoji.parse(text, { folder: '72x72', ext: '.png' }) : '';
}

// Helper: parse an array of text strings
function parseArray(arr) {
  return Array.isArray(arr) ? arr.map(item => parseEmoji(item)) : [];
}

// Helper: split step string into stepName and stepDesc
function splitStep(text) {
  // Try split at first period + space (if within first 40 chars)
  const periodSplit = text.indexOf('. ');
  if (periodSplit > 0 && periodSplit < 40) {
    const stepName = text.slice(0, periodSplit + 1).trim();
    const stepDesc = text.slice(periodSplit + 1).trim();
    return { stepName, stepDesc };
  }
  // Try split at first colon
  const colonSplit = text.indexOf(':');
  if (colonSplit > 0 && colonSplit < 40) {
    const stepName = text.slice(0, colonSplit + 1).trim();
    const stepDesc = text.slice(colonSplit + 1).trim();
    return { stepName, stepDesc };
  }
  // Fallback: no split, entire text is description
  return { stepName: '', stepDesc: text };
}

// Generate HTML content from recipe data
function generateRecipeHtml(data) {
  const parsedData = {
    ...data,
    recipeName: parseEmoji(data.recipeName),
    description: parseEmoji(data.description),
    ingredients: parseArray(data.ingredients),
    instructions: parseArray(data.instructions),
    prepTime: {
      label: parseEmoji(data?.prepTime?.label),
      val: parseEmoji(data?.prepTime?.val),
    },
    cookTime: {
      label: parseEmoji(data?.cookTime?.label),
      val: parseEmoji(data?.cookTime?.val),
    },
    totalTime: {
      label: parseEmoji(data?.totalTime?.label),
      val: parseEmoji(data?.totalTime?.val),
    },
    restTime: {
      label: parseEmoji(data?.restTime?.label),
      val: parseEmoji(data?.restTime?.val),
    },
    difficulty: {
      label: parseEmoji(data?.difficulty?.label),
      val: parseEmoji(data?.difficulty?.val),
    },
  };

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
        font-family: 'Open Sans', sans-serif;
        color: #333;
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
        font-weight: 600;
        color: #bf360c;
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

      /* New styles for images with steps */
      .images-with-steps {
        display: flex;
        flex-wrap: wrap;
        gap: 15px;
        justify-content: center;
        margin-top: 5px;
      }

      .image-step-pair {
        max-width: 140px;
        text-align: center;
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

      .step-text {
        margin-top: 8px;
        font-size: 0.95rem;
        color: #4e342e;
        text-align: left;
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
      <h1>${parsedData.recipeName || 'Recipe'}</h1>

      <div class="meta-info">
        ${parsedData.prepTime.label ? `<div class="meta-item"><span class="label">${parsedData.prepTime.label}:</span><span class="value">${parsedData.prepTime.val}</span></div>` : ''}
        ${parsedData.cookTime.label ? `<div class="meta-item"><span class="label">${parsedData.cookTime.label}:</span><span class="value">${parsedData.cookTime.val}</span></div>` : ''}
        ${parsedData.totalTime.label ? `<div class="meta-item"><span class="label">${parsedData.totalTime.label}:</span><span class="value">${parsedData.totalTime.val}</span></div>` : ''}
        ${parsedData.restTime.label ? `<div class="meta-item"><span class="label">${parsedData.restTime.label}:</span><span class="value">${parsedData.restTime.val}</span></div>` : ''}
        ${parsedData.difficulty.label ? `<div class="meta-item"><span class="label">${parsedData.difficulty.label}:</span><span class="value">${parsedData.difficulty.val}</span></div>` : ''}
      </div>

      ${parsedData.description ? `<section class="card"><h2>Description</h2><p>${parsedData.description}</p></section>` : ''}

      ${parsedData.ingredients.length ? `<section class="card"><h2>Ingredients</h2><ul class="ingredients">${parsedData.ingredients.map(i => `<li>${i}</li>`).join('')}</ul></section>` : ''}

      ${parsedData.instructions.length ? `
        <section class="card">
          <h2>Instructions</h2>
          <ol class="instructions">
            ${parsedData.instructions.map(i => {
              const { stepName, stepDesc } = splitStep(i);
              return `<li>
                ${stepName ? `<strong>${stepName}</strong> ` : ''}
                ${stepDesc}
              </li>`;
            }).join('')}
          </ol>
        </section>
      ` : ''}

      ${parsedData.imageUrls?.length ? `
        <section class="card">
          <h2>Images with Steps</h2>
          <div class="images-with-steps">
            ${parsedData.imageUrls.map((url, i) => {
              const { stepName, stepDesc } = splitStep(parsedData.instructions[i] || '');
              return `
                <div class="image-step-pair">
                  <img src="${url}" alt="Recipe image ${i + 1}" />
                  <p class="step-text">
                    ${stepName ? `<strong>${stepName}</strong><br>` : ''}
                    ${stepDesc}
                  </p>
                </div>
              `;
            }).join('')}
          </div>
        </section>
      ` : ''}

    </div>

    <footer>
      &copy; 2025 Food Trek
    </footer>
  </body>
  </html>
  `;
}

router.post('/premium-recipe', async (req, res) => {
  try {
    const recipeData = req.body;

    const htmlContent = generateRecipeHtml(recipeData);

    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '1cm', bottom: '1cm', left: '1cm', right: '1cm' },
    });

    await browser.close();

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': pdfBuffer.length,
      'Content-Disposition': `attachment; filename="${recipeData.recipeName || 'recipe'}.pdf"`,
    });

    res.send(pdfBuffer);
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).send('Error generating PDF');
  }
});

module.exports = router;
