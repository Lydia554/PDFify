function extractYouTubeId(url) {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname === 'youtu.be') {
      return urlObj.pathname.slice(1, 12); 
    }
    if (urlObj.hostname.includes('youtube.com')) {
      return urlObj.searchParams.get('v');
    }
  } catch {
    return null;
  }
  return null;
}

function generatePremiumRecipeHtml(data) {
  const {
    recipeName,
    prepTime,
    cookTime,
    servings,
    imageUrls,
    ingredients = [],
    instructions = [],
    nutrition,
    videoUrl,
  } = data;

  const videoId = videoUrl ? extractYouTubeId(videoUrl) : null;

  const nutritionRows = nutrition && typeof nutrition === 'object'
    ? Object.entries(nutrition)
        .map(([key, value]) => `
          <tr>
            <td>${key}</td>
            <td>${value}</td>
          </tr>
        `).join('')
    : '';

  return `
  <html>
  <head>
    <meta charset="UTF-8" />
    <title>${recipeName} - Premium Recipe</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;700&family=Playfair+Display:wght@700&display=swap');

      /* LIGHT / DARK THEME */
      @media (prefers-color-scheme: dark) {
        body {
          background-color: #121212;
          color: #eee;
        }
        .container {
          background: #1e1e1e;
          box-shadow: 0 10px 30px rgba(0,0,0,0.9);
        }
        h1, h2, .tag {
          color: #a5d6a7;
        }
        .tag {
          background: #2e7d32;
          border-color: #4caf50;
        }
        ul, ol {
          color: #ccc;
        }
        table {
          border-color: #444;
        }
        .footer {
          border-top-color: #444;
          color: #888;
        }
        a {
          color: #80cbc4;
        }
      }

      body {
        margin: 0;
        padding: 40px 20px 80px; /* extra bottom padding for footer */
        background-color: #fafafa;
        font-family: 'Roboto', sans-serif;
        color: #333;
        position: relative;
        min-height: 100vh;
      }

      /* Watermark */
      body::before {
        content: "Food Trek";
        position: fixed;
        top: 40%;
        left: 50%;
        font-size: 6rem;
        font-weight: 700;
        color: #eee;
        opacity: 0.05;
        transform: translate(-50%, -50%) rotate(-30deg);
        pointer-events: none;
        user-select: none;
        z-index: 0;
        font-family: 'Playfair Display', serif;
      }

      .container {
        max-width: 900px;
        margin: auto;
        background: #fff;
        padding: 40px 40px 60px;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.07);
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        gap: 40px;
      }

      .header {
        text-align: center;
        margin-bottom: 0;
      }

      h1 {
        font-family: 'Playfair Display', serif;
        font-size: 2.8rem;
        margin: 10px 0;
        color: #2e7d32;
        position: relative;
      }

      h1::after {
        content: '';
        display: block;
        width: 60px;
        height: 4px;
        background: #66bb6a;
        margin: 12px auto 0 auto;
        border-radius: 2px;
      }

      .tags {
        display: flex;
        justify-content: center;
        gap: 12px;
        margin-top: 20px;
        flex-wrap: wrap;
      }

      .tag {
        background: #e8f5e9;
        color: #2e7d32;
        padding: 6px 14px;
        border-radius: 20px;
        font-size: 0.9rem;
        font-weight: 500;
        border: 1px solid #c8e6c9;
        user-select: none;
      }

      /* Improved Images */
      .images {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 20px;
        margin: 0;
      }

      .images img {
        width: 280px;
        height: 180px;
        object-fit: cover;
        border-radius: 12px;
        box-shadow: 0 6px 18px rgba(0,0,0,0.12);
        transition: transform 0.3s ease;
      }

      .images img:hover {
        transform: scale(1.05);
      }

      .section {
        margin-top: 0;
      }

      .section h2 {
        font-size: 1.6rem;
        color: #388e3c;
        margin-bottom: 20px;
        border-bottom: 2px solid #c8e6c9;
        padding-bottom: 6px;
      }

      .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 30px;
      }

      ul, ol {
        padding-left: 20px;
        font-size: 1rem;
        line-height: 1.7;
        color: #4e342e;
      }

      li {
        margin-bottom: 12px;
      }

      /* Nutrition Table */
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 15px;
        font-size: 0.95rem;
      }

      table th, table td {
        border: 1px solid #ddd;
        padding: 8px 12px;
        text-align: left;
        color: #4e342e;
      }

      table th {
        background-color: #e8f5e9;
        color: #2e7d32;
      }

      /* Video + QR container */
      .video-qr-container {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 40px;
        margin-top: 40px;
        flex-wrap: wrap;
      }

      .video-section, .qr-section {
        flex: 1 1 280px;
        max-width: 320px;
        text-align: center;
      }

      .video-section strong {
        display: block;
        margin-bottom: 10px;
        font-size: 1.1rem;
        color: #2e7d32;
      }

      .video-section img.thumb {
        width: 100%;
        border-radius: 12px;
        box-shadow: 0 6px 18px rgba(0,0,0,0.15);
      }

      .qr-section img {
        width: 140px;
        height: 140px;
        border-radius: 12px;
        box-shadow: 0 6px 18px rgba(0,0,0,0.15);
      }

      .qr-section em {
        display: block;
        margin-top: 12px;
        color: #666;
        font-size: 0.95rem;
      }

      /* Footer stays below everything */
      .footer {
        padding: 20px 10px 10px;
        font-size: 12px;
        background-color: #f9f9f9;
        color: #444;
        border-top: 1px solid #ccc;
        text-align: center;
        line-height: 1.6;
        position: relative;
        margin-top: 60px;
      }

      .footer a {
        color: #0073e6;
        text-decoration: none;
        word-break: break-word;
      }

      .footer a:hover {
        text-decoration: underline;
      }

      /* Responsive */
      @media screen and (max-width: 768px) {
        .grid {
          grid-template-columns: 1fr;
        }
        .images {
          flex-direction: column;
          align-items: center;
        }
        .video-qr-container {
          flex-direction: column;
          gap: 24px;
        }
        .video-section, .qr-section {
          max-width: 100%;
          flex: none;
        }
        .footer {
          font-size: 11px;
          padding: 15px 10px;
          line-height: 1.4;
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>${recipeName}</h1>
        <div class="tags">
          <div class="tag">⏰ Prep: ${prepTime || 'N/A'} min</div>
          <div class="tag">🔥 Cook: ${cookTime || 'N/A'} min</div>
          ${servings ? `<div class="tag">🍽️ Serves: ${servings}</div>` : ''}
        </div>
      </div>

      ${
        Array.isArray(imageUrls)
          ? `<div class="images">${imageUrls
              .map((src) => `<img src="${src}" alt="Recipe Image" loading="lazy" />`)
              .join('')}</div>`
          : ''
      }

      <div class="section grid">
        <div>
          <h2>📝 Ingredients</h2>
          <ul>
            ${
              Array.isArray(ingredients)
                ? ingredients.map((i) => `<li>${i}</li>`).join('')
                : `<li>${ingredients || 'No ingredients listed.'}</li>`
            }
          </ul>
        </div>
        <div>
          <h2>👨‍🍳 Instructions</h2>
          <ol>
            ${
              Array.isArray(instructions)
                ? instructions.map((i) => `<li>${i}</li>`).join('')
                : `<li>${instructions || 'No instructions provided.'}</li>`
            }
          </ol>
        </div>
      </div>

      ${
        nutritionRows
          ? `<div class="section">
              <h2>📊 Nutrition Facts</h2>
              <table>
                <thead>
                  <tr><th>Nutrient</th><th>Amount</th></tr>
                </thead>
                <tbody>
                  ${nutritionRows}
                </tbody>
              </table>
            </div>`
          : ''
      }

      <div class="video-qr-container">
        ${
          videoUrl && videoId
            ? `
              <div class="video-section">
                <strong>🎥 Watch the Recipe Video:</strong>
                <img class="thumb" src="https://img.youtube.com/vi/${videoId}/hqdefault.jpg" alt="Video thumbnail" />
              </div>
              <div class="qr-section">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(videoUrl)}" alt="QR code" />
              </div>
            `
            : `<div class="qr-section"><em>No video link provided.</em></div>`
        }
      </div>

      <div class="footer">
        <p>Thanks for using our service!</p>
        <p>If you have questions, contact us at <a href="mailto:pdfifyapi@gmail.com">pdfifyapi@gmail.com</a>.</p>
        <p>&copy; 2025 🧾PDFify — All rights reserved.</p> 
        <p>
          Generated using <strong>PDFify</strong>. Visit 
          <a href="https://pdfify.pro/" target="_blank" rel="noopener noreferrer">our site</a> for more.
        </p>
      </div>
    </div>
  </body>
  </html>
  `;
}


module.exports = (data) => {
    console.log('✅ PREMIUM template function is being used');
    return generatePremiumRecipeHtml(data);
  };
  