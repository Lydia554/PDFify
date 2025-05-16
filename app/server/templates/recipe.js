const { formatDate } = require('../shared/formatDate');

function generateRecipeHtml(data) {
  return `
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        h1, h3 { color: #2a9d8f; }
        p { margin: 5px 0; }
        ul, ol { margin: 0 0 15px 20px; }
      </style>
    </head>
    <body>
      ${data.includeTitle ? `<h1>Recipe: ${data.recipeName}</h1>` : ''}
      ${data.includeAuthor ? `<p>Author: ${data.author}</p>` : ''}
      ${data.includePrepTime ? `<p>Prep Time: ${data.prepTime}</p>` : ''}
      ${data.includeCookTime ? `<p>Cook Time: ${data.cookTime}</p>` : ''}
      
      ${data.includeIngredients ? `
        <h3>Ingredients:</h3>
        <ul>
          ${data.ingredients.map(i => `<li>${i}</li>`).join('')}
        </ul>
      ` : ''}

      ${data.includeInstructions ? `
        <h3>Instructions:</h3>
        <ol>
          ${data.instructions.map(i => `<li>${i}</li>`).join('')}
        </ol>
      ` : ''}
    </body>
    </html>
  `;
}

module.exports = generateRecipeHtml;
