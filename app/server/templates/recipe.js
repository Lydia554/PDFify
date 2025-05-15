export const friendlyFieldsHtml = `
  <label for="title">Recipe Title:</label>
  <input type="text" id="title" />

  <label for="ingredients">Ingredients:</label>
  <textarea id="ingredients"></textarea>

  <label for="steps">Steps:</label>
  <textarea id="steps"></textarea>
`;

export function collectFriendlyData() {
  return {
    title: document.getElementById("title").value,
    ingredients: document.getElementById("ingredients").value.split("\n"),
    steps: document.getElementById("steps").value.split("\n"),
  };
}
