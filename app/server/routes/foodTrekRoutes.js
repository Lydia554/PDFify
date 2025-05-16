const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const twemoji = require('twemoji');

// Parse emoji with twemoji
function parseEmoji(text) {
  return text ? twemoji.parse(text, { folder: '72x72', ext: '.png' }) : '';
}

// Parse array of strings or objects with title+desc
function parseArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(item => {
    if (typeof item === 'string') return parseEmoji(item);
    // if object with title and description, parse both
    if (typeof item === 'object' && item !== null) {
      return {
        title: parseEmoji(item.title || ''),
        description: parseEmoji(item.description || ''),
      };
    }
    return '';
  });
}

// Generate the HTML content
function generateRecipeHtml(data) {
  const parsedData = {
    ...data,
    recipeName: parseEmoji(data.recipeName),
    description: data.description
      ? typeof data.description === 'object'
        ? { 
            title: parseEmoji(data.description.title), 
            text: parseEmoji(data.description.text)
          }
        : parseEmoji(data.description)
      : '',
    ingredients: parseArray(data.ingredients),
    // instructions can be array of {title, description} or strings
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
    imageUrls: Array.isArray(data.imageUrls) ? data.imageUrls : [],
  };

  // Helper to generate the instructions with images + step text under each image
  // Match imageUrls and instructions by index
  const instructionsWithImages = parsedData.imageUrls.map((url, i) => {
    const step = parsedData.instructions[i];
    if (!step) {
      // No instruction for this image, just show image
      return `<div class="instruction-step">
                <img src="${url}" alt="Recipe Image" />
              </div>`;
    }

    // If step is object with title and description
    if (typeof step === 'object') {
      return `<div class="instruction-step">
                <img src="${url}" alt="Recipe Image" />
                <h3>${step.title || ''}</h3>
                <p>${step.description || ''}</p>
              </div>`;
    }

    // If step is just a string
    return `<div class="instruction-step">
              <img src="${url}" alt="Recipe Image" />
              <p>${step}</p>
            </div>`;
  }).join('');

  // For instructions that have no image, display them as a list below
  const instructionsNoImage = parsedData.instructions.length > parsedData.imageUrls.length
    ? parsedData.instructions.slice(parsedData.imageUrls.length).map(instr => {
      if (typeof instr === 'object') {
        return `<li><strong>${instr.title}</strong>: ${instr.description}</li>`;
      }
      return `<li>${instr}</li>`;
    }).join('')
    : '';

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
      ul.ingredients {
        padding-left: 25px;
        font-size: 1.1rem;
        color: #4e342e;
      }
      ol.instructions-list {
        padding-left: 25px;
        font-size: 1.1rem;
        color: #4e342e;
      }
      ol.instructions-list li {
        margin-bottom: 10px;
      }
      .instruction-step {
        margin-bottom: 25px;
        text-align: center;
      }
      .instruction-step img {
        max-width: 100%;
        border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        margin-bottom: 8px;
      }
      .instruction-step h3 {
        font-family: 'Merriweather', serif;
        font-weight: 700;
        font-size: 1.2rem;
        color: #bf360c;
        margin: 5px 0 5px 0;
      }
      .instruction-step p {
        font-size: 1rem;
        color: #4e342e;
        margin: 0 10px 0 10px;
      }
      .description-text {
        margin-top: 15px;
        font-size: 1.05rem;
        color: #5d4037;
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
        .instruction-step img {
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

      ${parsedData.description
        ? (typeof parsedData.description === 'object'
            ? `<section class="card description">
                <h2>${parsedData.description.title || 'Description'}</h2>
                <p class="description-text">${parsedData.description.text || ''}</p>
              </section>`
            : `<section class="card description">
                <h2>Description</h2>
                <p class="description-text">${parsedData.description}</p>
              </section>`)
        : ''
      }

      <section class="card ingredients">
        <h2>Ingredients</h2>
        <ul class="ingredients">
          ${parsedData.ingredients.length
            ? parsedData.ingredients.map(ing => `<li>${ing}</li>`).join('')
            : '<li>No ingredients provided</li>'}
        </ul>
      </section>

      <section class="card instructions">
        <h2>Instructions</h2>
        ${instructionsWithImages}

        ${
          instructionsNoImage
            ? `<div class="no-image-instructions"><h3>Additional Steps</h3><ol class="instructions-list">${instructionsNoImage}</ol></div>`
            : ''
        }
      </section>
    </div>

    <footer>
      PDF generated by Food Trek &mdash; https://food-trek.com
    </footer>
  </body>
  </html>
  `;
}

router.post('/premium-recipe', async (req, res) => {
  try {
    const recipeData = req.body;

    // Generate the HTML from the recipe data
    const htmlContent = generateRecipeHtml(recipeData);

    // Launch Puppeteer and generate PDF
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    // Set the HTML content in Puppeteer page
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    // Create PDF buffer
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '1cm', bottom: '1cm', left: '1cm', right: '1cm' },
    });

    await browser.close();

    // Set response headers and send PDF
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': pdfBuffer.length,
      'Content-Disposition': `attachment; filename="${recipeData.recipeName?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'recipe'}.pdf"`,
    });

    res.send(pdfBuffer);

  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).send('Error generating PDF');
  }
});

module.exports = router;
