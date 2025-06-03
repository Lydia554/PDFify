function generateBasicRecipeHtml(data) { 

  return `
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


      .logo {
        display: block;
        margin: 30px auto 10px auto;
        max-width: 100px;
      }

      h1 {
        font-family: 'Merriweather', serif;
        font-weight: 700;
        font-size: 2.8rem;
        color: #e65100;
        margin: 20px auto 20px auto;
        border-bottom: 3px solid #ff7043;
        padding-bottom: 8px;
        max-width: 600px;
        text-align: center;
      }

      p {
        font-size: 1rem;
        color: #4e342e;
        font-weight: 400;
        margin: 0 0 10px 0;
        text-align: center;
      }

      .section-title {
        font-family: 'Merriweather', serif;
        font-weight: 700;
        font-size: 1.9rem;
        color: #bf360c;
        border-bottom: 2px solid #ffab91;
        padding-bottom: 8px;
        margin: 40px auto 20px auto;
        max-width: 600px;
        text-align: left;
      }

      ul.ingredients, ol.instructions {
        max-width: 600px;
        margin: 0 auto 40px auto;
        padding-left: 25px;
        font-size: 1.1rem;
        color: #4e342e;
      }

      ol.instructions li {
        margin-bottom: 14px;
      }

      img.recipe-img {
        display: block;
        max-width: 400px;
        width: 100%;
        border-radius: 12px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        margin: 10px auto 30px auto;
        transition: transform 0.3s ease;
      }

      img.recipe-img:hover {
        transform: scale(1.05);
      }

      .emoji {
        font-size: 1.3em;
        margin-left: 6px;
      }

      .footer {
  font-size: 11px !important;  /* FORCE font-size in PDF render */
  background-color: #f9f9f9;
  color: #444;
  border-top: 1px solid #ccc;
  text-align: center;
  line-height: 1.6;
  padding: 20px 10px;
  margin-top: 100%; /* push it away from content */
  page-break-inside: avoid;
}


footer p {
  font-size: 10px 
}

.footer a {
  color: #0073e6;
  text-decoration: none;
}

.footer a:hover {
  text-decoration: underline;
}
      @media screen and (max-width: 600px) {
        h1 {
          font-size: 1.8rem;
          margin: 20px auto 15px auto;
        }

        .section-title {
          font-size: 1.3rem;
          margin: 30px auto 15px auto;
        }

        ul.ingredients, ol.instructions {
          padding-left: 18px;
          font-size: 0.95rem;
          margin-bottom: 30px;
        }

        p {
          font-size: 0.95rem;
          margin-bottom: 8px;
        }

        img.recipe-img {
          max-width: 100%;
          margin-bottom: 20px;
        }

           .footer {
      font-size: 11px;
      padding: 15px 10px;
      line-height: 1.4;
    }

    .footer p {
      margin: 6px 0;
    }

    .footer a {
      word-break: break-word;
    }
      }
    </style>
  </head>
  <body>
    <img src="https://pdf-api.portfolio.lidija-jokic.com/images/Logo.png" alt="Food Trek Logo" class="logo" />
    <h1>${data.recipeName} <span class="emoji">🍽️</span></h1>

    ${
      Array.isArray(data.imageUrls)
        ? data.imageUrls.map(src => `<img src="${src}" alt="Recipe Image" class="recipe-img" />`).join('')
        : ''
    }

    <p><strong>⏰ Prep Time:</strong> ${data.prepTime ? `${data.prepTime} min` : 'N/A'}</p>
    <p><strong>⏰ Cook Time:</strong> ${data.cookTime ? `${data.cookTime} min` : 'N/A'}</p>

    <div class="section-title">Ingredients <span class="emoji">🔪🥩🍅</span></div>
   <ul class="ingredients">
  ${Array.isArray(data.ingredients)
    ? data.ingredients.map(i => `<li>${i}</li>`).join('')
    : '<li>No ingredients listed.</li>'
  }
</ul>

    <div class="section-title">Instructions <span class="emoji">👩‍🍳🍳</span></div>
   <ol class="instructions">
  ${Array.isArray(data.instructions)
    ? data.instructions.map(i => `<li>${i}</li>`).join('')
    : '<li>No instructions available.</li>'
  }
</ol>


 <div class="footer">
  <p>Thanks for using our service!</p>
  <p>If you have questions, contact us at <a href="mailto:supportpdfifyapi@gmail.com">supportpdfifyapi@gmail.com</a>.</p>
  <p>&copy; 2025 🧾PDFify — All rights reserved.</p> 
  <p>
    Generated using <strong>PDFify</strong>. Visit 
    <a href="https://pdf-api.portfolio.lidija-jokic.com/" target="_blank">our site</a> for more.
  </p>
</div>

  </body>
  </html>
  `;
}

module.exports = (data) => {
  return generateBasicRecipeHtml(data);
};
