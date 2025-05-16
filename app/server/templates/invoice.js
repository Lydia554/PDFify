function generateRecipeHtml(data) {
  return `
  <html>
  <head>
    <style>
      body { font-family: Arial, sans-serif; margin: 20px; }
      h1 { color: #e63946; }
      h2 { color: #457b9d; margin-top: 1em; }
      ul { list-style-type: disc; margin-left: 20px; }
      .section-title { font-weight: bold; margin-top: 1em; }
      .time-difficulty { font-style: italic; margin-bottom: 1em; }
      .instructions { margin-top: 1em; }
      a { color: #1d3557; text-decoration: none; }
      a:hover { text-decoration: underline; }
    </style>
  </head>
  <body>
    <h1>${data.title}</h1>
    <p>${data.description}</p>
    
    <p class="time-difficulty">
      Prep Time: ${data.prepTime} | Cook Time: ${data.cookTime} | Total Time: ${data.totalTime}<br>
      Difficulty: ${data.difficulty} | Cooking Temp: ${data.cookingTemp}
    </p>
    
    ${data.ingredients.map(section => `
      <h2>${section.section}</h2>
      <ul>
        ${section.items.map(item => `<li>${item}</li>`).join('')}
      </ul>
    `).join('')}
    
    <h2>Instructions</h2>
    <ol class="instructions">
      ${data.instructions.map(step => `<li>${step}</li>`).join('')}
    </ol>
    
    <p>Read it online: <a href="${data.readOnlineUrl}">${data.readOnlineUrl}</a></p>
  </body>
  </html>
  `;
}

module.exports = generateRecipeHtml;
