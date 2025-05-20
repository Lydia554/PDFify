function generateRecipeHtml(data) {
  return `
  <html>
  <head>
    <style>
      body {
        font-family: 'Arial', sans-serif;
        padding: 30px;
        color: #444;
        background: #fff;
      }
      h1 {
        color: #d84315;
        border-bottom: 3px solid #ff7043;
        padding-bottom: 10px;
      }
      p, li {
        font-size: 16px;
        line-height: 1.5;
      }
      ul.ingredients {
        list-style-type: disc;
        margin-left: 20px;
        margin-bottom: 20px;
      }
      ol.instructions {
        margin-left: 20px;
        margin-bottom: 20px;
      }
      img {
        max-width: 100%;
        border-radius: 10px;
        margin-bottom: 20px;
      }
      .section-title {
        font-size: 22px;
        color: #bf360c;
        margin-top: 30px;
        margin-bottom: 10px;
        font-weight: bold;
        border-bottom: 2px solid #ff8a65;
        padding-bottom: 4px;
      }
      .emoji {
        font-size: 1.3em;
        margin-right: 6px;
      }

  /* MOBILE STYLES */
  @media screen and (max-width: 600px) {
    body {
      padding: 20px;
    }

    h1 {
      font-size: 1.6rem;
    }

    .section-title {
      font-size: 18px;
    }

    p, li {
      font-size: 15px;
    }

    ul.ingredients,
    ol.instructions {
      margin-left: 16px;
    }
  }



    </style>
  </head>
 <body>
  <h1>${data.recipeName} <span class="emoji">🍽️</span></h1>

  ${data.imageUrl ? `<img src="${data.imageUrl}" alt="Recipe Image" />` : ''}

  <p><strong>⏰Prep Time:</strong> ${data.prepTime ? `${data.prepTime} min` : 'N/A'}</p>
<p><strong>⏰Cook Time:</strong> ${data.cookTime ? `${data.cookTime} min` : 'N/A'}</p>


  <div class="section-title">Ingredients <span class="emoji">🔪🥩🍅</span></div>
  <ul class="ingredients">
    ${data.ingredients.map(i => `<li>${i}</li>`).join('')}
  </ul>

  <div class="section-title">Instructions <span class="emoji">👩‍🍳🍳</span></div>
  <ol class="instructions">
    ${data.instructions.map(i => `<li>${i}</li>`).join('')}
  </ol>
</body>

  </html>
  `;
}
module.exports = generateRecipeHtml;