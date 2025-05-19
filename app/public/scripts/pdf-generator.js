const templateSelect = document.getElementById('templateSelect');
const formContainer = document.getElementById('formContainer');
const generatePdfBtn = document.getElementById('generatePdfBtn');

function renderForm(template) {
  let html = '';
  if (template === 'invoice') {
    html = `
      <label>Customer Name: <input id="customerName" /></label><br/>
      <label>Date: <input type="date" id="date" /></label><br/>
      <label>Amount: <input type="number" id="amount" /></label><br/>
    `;
  } else if (template === 'recipe') {
    html = `
      <label>Recipe Name: <input id="recipeName" /></label><br/>
      <label>Author: <input id="author" /></label><br/>
      <label>Prep Time: <input id="prepTime" /></label><br/>
      <label>Cook Time: <input id="cookTime" /></label><br/>
      <label>Ingredients (comma separated): <input id="ingredients" /></label><br/>
      <label>Instructions (semicolon separated): <input id="instructions" /></label><br/>
    `;
  }
  formContainer.innerHTML = html;
}

templateSelect.addEventListener('change', () => {
  renderForm(templateSelect.value);
});

generatePdfBtn.addEventListener('click', async () => {
  const template = templateSelect.value;
  let formData = {};

  if (template === 'invoice') {
    formData = {
      customerName: document.getElementById('customerName').value,
      date: document.getElementById('date').value,
      amount: document.getElementById('amount').value,
    };
  } else if (template === 'recipe') {
    formData = {
      recipeName: document.getElementById('recipeName').value,
      author: document.getElementById('author').value,
      prepTime: document.getElementById('prepTime').value,
      cookTime: document.getElementById('cookTime').value,
      ingredients: document.getElementById('ingredients').value.split(',').map(i => i.trim()),
      instructions: document.getElementById('instructions').value.split(';').map(i => i.trim()),
    };
  }

  try {
    const res = await fetch('/api/friendly/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template, ...formData }),

    });
    if (!res.ok) throw new Error('Failed to generate PDF');

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${template}_${Date.now()}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    alert(error.message);
  }
});

renderForm(templateSelect.value);
