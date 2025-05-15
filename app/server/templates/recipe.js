
const { formatDate } = require('../shared/formatDate');

function generateRecipeHtml(data) {
  return `
    <h1>Recipe: ${data.recipeName}</h1>
    <p>Author: ${data.author}</p>
    <p>Prep Time: ${data.prepTime}</p>
    <p>Cook Time: ${data.cookTime}</p>
    <h3>Ingredients:</h3>
    <ul>
      ${data.ingredients.map(i => `<li>${i}</li>`).join('')}
    </ul>
    <h3>Instructions:</h3>
    <ol>
      ${data.instructions.map(i => `<li>${i}</li>`).join('')}
    </ol>
  `;
}

module.exports = generateRecipeHtml;
