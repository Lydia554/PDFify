const { formatDate } = require('./shared');

function generateRecipeHtml(data) {
  return `
    <h1>Recipe: ${data.recipeName}</h1>
    <p>Author: ${data.author}</p>
    <p>Preparation Time: ${data.prepTime}</p>
    <p>Cooking Time: ${data.cookTime}</p>
    <h3>Ingredients:</h3>
    <ul>
      ${data.ingredients.map(ing => `<li>${ing}</li>`).join('')}
    </ul>
    <h3>Instructions:</h3>
    <ol>
      ${data.instructions.map(step => `<li>${step}</li>`).join('')}
    </ol>
  `;
}

module.exports = {
  generateRecipeHtml,
};
