const templateSelect = document.getElementById('templateSelect');
const formContainer = document.getElementById('formContainer');
const generatePdfBtn = document.getElementById('generateFriendlyBtn');
const friendlyResult = document.getElementById('friendlyResult');

function renderForm(template) {
  let html = '';
  if (template === 'invoice') {
    html = `
      <label>Customer Name: <input id="customerName" /></label><br/>
      <label>Date: <input type="date" id="date" /></label><br/>
      <label>Invoice Number: <input id="invoiceNumber" /></label><br/>
      
      <label>Items (format: description,quantity,unitPrice per line):</label><br/>
      <textarea id="items" rows="5" cols="30" placeholder="e.g. Apple,2,1.50"></textarea><br/>
      
      <label>Tax Rate (%): <input type="number" id="taxRate" value="0" /></label><br/>
      
      <label><input type="checkbox" id="includeTitle" checked /> Include Title</label><br/>
    `;
  } else if (template === 'recipe') {
    html = `
      <label>Recipe Name: <input id="recipeName" /></label><br/>
      <label>Author: <input id="author" /></label><br/>
      <label>Prep Time: <input id="prepTime" /></label><br/>
      <label>Cook Time: <input id="cookTime" /></label><br/>
      <label>Ingredients (comma separated): <input id="ingredients" /></label><br/>
      <label>Instructions (semicolon separated): <input id="instructions" /></label><br/>
      
      <!-- Include Title checkbox should be here too -->
      <label><input type="checkbox" id="includeTitle" checked /> Include Title</label><br/>
    `;
  }
  formContainer.innerHTML = html;
 
}

renderForm(templateSelect.value);

templateSelect.addEventListener('change', () => {
  renderForm(templateSelect.value);
});

generatePdfBtn.addEventListener('click', async () => {
  const template = templateSelect.value;
  let formData = {};


  try {
    if (template === 'invoice') {
      const itemsText = document.getElementById('items')?.value.trim();
      const items = itemsText ? itemsText.split('\n').map(line => {
        const [description, quantity, unitPrice] = line.split(',').map(s => s.trim());
        return {
          description: description || 'N/A',
          quantity: Number(quantity) || 0,
          unitPrice: Number(unitPrice) || 0,
        };
      }) : [];

      const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      const taxRate = Number(document.getElementById('taxRate')?.value) || 0;
      const taxAmount = subtotal * taxRate / 100;
      const total = subtotal + taxAmount;

      const includeTitle = document.getElementById('includeTitle');
    

      formData = {
        customerName: document.getElementById('customerName')?.value,
        date: document.getElementById('date')?.value,
        invoiceNumber: document.getElementById('invoiceNumber')?.value || 'N/A',
        items,
        subtotal,
        taxRate,
        taxAmount,
        total,
        includeTitle: includeTitle?.checked ?? false,
      };

    } else if (template === 'recipe') {
      const includeTitle = document.getElementById('includeTitle');
 

      formData = {
        recipeName: document.getElementById('recipeName')?.value,
        author: document.getElementById('author')?.value,
        prepTime: document.getElementById('prepTime')?.value,
        cookTime: document.getElementById('cookTime')?.value,
        ingredients: document.getElementById('ingredients')?.value.split(',').map(s => s.trim()),
        instructions: document.getElementById('instructions')?.value.split(';').map(s => s.trim()),
        includeTitle: includeTitle?.checked ?? false,
      };
    }

   

    friendlyResult.textContent = 'Generating PDF...';

    const response = await fetch('/api/friendly/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template, ...formData }),
    });

    

    if (!response.ok) {
      const errorData = await response.json();
    
      throw new Error(errorData.error || 'Failed to generate PDF');
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${template}_${Date.now()}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    friendlyResult.textContent = '✅ PDF downloaded!';
   
  } catch (error) {
   
    friendlyResult.textContent = `Error: ${error.message}`;
  }
});
