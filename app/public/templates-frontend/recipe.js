const { formatDate } = require('../shared/shared');

export const friendlyFieldsHtml = `
  <label>Recipe Name: <input type="text" id="recipeName" required></label><br>
  <label>Author: <input type="text" id="author" required></label><br>
  <label>Preparation Time: <input type="text" id="prepTime" placeholder="e.g. 30 minutes"></label><br>
  <label>Cooking Time: <input type="text" id="cookTime" placeholder="e.g. 40 minutes"></label><br>
  <label>Ingredients (JSON array): <textarea id="ingredients" rows="5" required>["500g flour", "200g cheese"]</textarea></label><br>
  <label>Instructions (JSON array): <textarea id="instructions" rows="5" required>["Mix ingredients", "Bake at 180°C for 40 mins"]</textarea></label>
`;

export function collectFriendlyData() {
  const recipeName = document.getElementById('recipeName').value;
  const author = document.getElementById('author').value;
  const prepTime = document.getElementById('prepTime').value;
  const cookTime = document.getElementById('cookTime').value;
  let ingredients, instructions;
  try {
    ingredients = JSON.parse(document.getElementById('ingredients').value);
    instructions = JSON.parse(document.getElementById('instructions').value);
  } catch {
    alert('Ingredients and Instructions must be valid JSON arrays');
    return null;
  }

  return {
    recipeName,
    author,
    prepTime,
    cookTime,
    ingredients,
    instructions,
  };
}
