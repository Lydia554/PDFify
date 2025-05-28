function extractYouTubeId(url) {
  const regExp = /^.*(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=)([^#\&\?]{11}).*/;
  const match = url.match(regExp);
  return match && match[1] ? match[1] : null;
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
    logoBase64 // ✔️ used for the logo at the top
  } = data;

  const videoId = videoUrl ? extractYouTubeId(videoUrl) : null;

  const logoSrc = logoBase64 || 'https://pdf-api.portfolio.lidija-jokic.com/images/Logo.png';

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
      <title>${data.recipeName} - Premium Recipe</title>
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
          padding: 40px 20px;
          background-color: #fafafa;
          font-family: 'Roboto', sans-serif;
          color: #333;
          position: relative;
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
          padding: 40px;
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.07);
          position: relative;
          z-index: 1;
        }
  
        .header {
          text-align: center;
          margin-bottom: 40px;
        }
  
        .logo {
          max-width: 90px;
          margin-bottom: 10px;
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
  
        .images {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 20px;
          margin: 30px 0;
        }
  
        .images img {
          max-width: 260px;
          border-radius: 12px;
          box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }
  
        .section {
          margin-top: 40px;
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
  
      
        /* QR Code */
   .qr-box {
        margin-top: 40px;
        text-align: center;
      }

      .qr-box img {
        max-width: 150px;
        border-radius: 12px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.1);
      }

      .qr-box .thumb {
        display: block;
        margin: 12px auto 0 auto;
        max-width: 220px;
        border-radius: 12px;
      }

      .qr-box em {
        color: #666;
        font-size: 0.95rem;
      }
  
        .footer {
          text-align: center;
          font-size: 0.85rem;
          color: #999;
          margin-top: 60px;
          padding-top: 20px;
          border-top: 1px solid #eee;
        }
  
        .footer a {
          color: #66bb6a;
          text-decoration: none;
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
          
        }
      </style>
    </head>
   <body>
    <div class="container">
      <div class="header">
        <img src="https://pdf-api.portfolio.lidija-jokic.com/images/Logo.png" alt="Logo" class="logo" />
        <h1>${data.recipeName}</h1>
        <div class="tags">
          <div class="tag">⏰ Prep: ${data.prepTime || 'N/A'} min</div>
          <div class="tag">🔥 Cook: ${data.cookTime || 'N/A'} min</div>
          ${
            data.servings
              ? `<div class="tag">🍽️ Serves: ${data.servings}</div>`
              : ''
          }
        </div>
      </div>

      ${
        Array.isArray(data.imageUrls)
          ? `<div class="images">${data.imageUrls
              .map(
                (src) =>
                  `<img src="${src}" alt="Recipe Image" loading="lazy" />`
              )
              .join('')}</div>`
          : ''
      }

      <div class="section grid">
        <div>
          <h2>📝 Ingredients</h2>
          <ul>
            ${data.ingredients.map((i) => `<li>${i}</li>`).join('')}
          </ul>
        </div>
        <div>
          <h2>👨‍🍳 Instructions</h2>
          <ol>
            ${data.instructions.map((i) => `<li>${i}</li>`).join('')}
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

      <div class="qr-box">
        ${
          data.videoUrl && videoId
            ? `
          <div><strong>🎥 Watch the Recipe Video:</strong></div>
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(
            data.videoUrl
          )}" alt="QR code" />
          <img class="thumb" src="https://img.youtube.com/vi/${videoId}/hqdefault.jpg" alt="Video thumbnail" />
        `
            : `<em>No video link provided.</em>`
        }
      </div>

      <div class="footer">
        <p>Created with 💙 by <strong>Food Trek</strong> — <a href="https://food-trek.com">food-trek.com</a></p>
         <p>&copy; 2025 🧾PDFify — All rights reserved.</p>
        <p>Need help? Contact us at <a href="mailto:supportpdfifyapi@gmail.com">supportpdfifyapi@gmail.com</a></p>
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
  