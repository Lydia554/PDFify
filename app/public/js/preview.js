document.addEventListener('DOMContentLoaded', () => {
  const previewDevBtn = document.getElementById('previewDevBtn');
  const previewFriendlyBtn = document.getElementById('previewFriendlyBtn');
  const friendlySelect = document.getElementById('friendly-endpoint-select');
  const formContainer = document.getElementById('formContainer');
  const apiKeyInput = document.getElementById('apiKey');

  // Render form inputs depending on selected template
  function renderForm(template) {
    formContainer.innerHTML = ''; // Clear previous

    if (template === 'invoice') {
      formContainer.innerHTML = `
        <label>Customer Name: <input name="customerName" value="Lidija Jokić" /></label><br/>
        <label>Company Name: <input name="companyName" value="PDFify Inc." /></label><br/>
        <label>Date: <input name="date" value="2025-05-27" type="date" /></label><br/>
        <label>Invoice Number: <input name="invoiceNumber" value="INV-001" /></label><br/>
        <label>Item Description: <input name="items[0].description" value="Development Services" /></label><br/>
        <label>Item Quantity: <input name="items[0].quantity" value="1" type="number" /></label><br/>
        <label>Item Unit Price: <input name="items[0].unitPrice" value="500" type="number" /></label><br/>
        <label>Subtotal: <input name="subtotal" value="500" type="number" /></label><br/>
        <label>Tax Rate (%): <input name="taxRate" value="19" type="number" /></label><br/>
        <label>Tax Amount: <input name="taxAmount" value="95" type="number" /></label><br/>
        <label>Total: <input name="total" value="595" type="number" /></label><br/>
      `;
    } else if (template === 'recipe') {
      // Add recipe inputs here similarly
      formContainer.innerHTML = `
        <label>Recipe Name: <input name="recipeName" value="Chocolate Cake" /></label><br/>
        <label>Ingredients: <textarea name="ingredients">Flour, Sugar, Cocoa Powder</textarea></label><br/>
        <label>Instructions: <textarea name="instructions">Mix all ingredients and bake.</textarea></label><br/>
      `;
    }
  }

  // Initial form render
  renderForm(friendlySelect.value);

  // Update form on template change
  friendlySelect.addEventListener('change', () => {
    renderForm(friendlySelect.value);
  });

  // Collects all input data from Friendly Mode form
  async function getFriendlyFormData() {
    const inputs = formContainer.querySelectorAll('input, textarea, select');
    const data = {};
    const items = [];

    for (const input of inputs) {
      if (!input.name) continue;

      if (input.type === 'file' && input.files.length > 0) {
        const file = input.files[0];
        const base64 = await fileToBase64(file);
        data[input.name + 'Url'] = base64;
      } else {
        const name = input.name;

        // Check for item-style input like items[0].description
        const itemMatch = name.match(/^items\[(\d+)\]\.(\w+)$/);
        if (itemMatch) {
          const index = parseInt(itemMatch[1], 10);
          const key = itemMatch[2];

          if (!items[index]) items[index] = {};
          items[index][key] = input.value;
        } else {
          data[name] = input.value;
        }
      }
    }

    // Attach built items array to final data
    if (items.length > 0) data.items = items;

    return data;
  }

  // Converts file to base64
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Friendly Mode preview button handler
  previewFriendlyBtn?.addEventListener('click', async () => {
    const selectedTemplate = friendlySelect.value;
    const apiKey = apiKeyInput.value.trim();
    const payload = await getFriendlyFormData();

    payload.template = selectedTemplate;

    try {
      const response = await fetch(`/api/friendly/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        alert('Error generating preview: ' + errorText);
        return;
      }

      const blob = await response.blob();
      const pdfUrl = URL.createObjectURL(blob);

      // Open PDF in new tab/window (no iframe)
      window.open(pdfUrl, '_blank');
    } catch (err) {
      alert('Error generating preview: ' + err.message);
    }
  });

  // Developer Mode preview logic (optional, unchanged)
  previewDevBtn?.addEventListener('click', async () => {
    const endpoint = document.getElementById('endpoint').value;
    const apiKey = apiKeyInput.value.trim();
    const jsonData = document.getElementById('json').value;

    try {
      const payload = JSON.parse(jsonData);
      const response = await fetch(`/api/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        alert('Error generating preview: ' + errorText);
        return;
      }

      const blob = await response.blob();
      const pdfUrl = URL.createObjectURL(blob);

      window.open(pdfUrl, '_blank');
    } catch (err) {
      alert('Invalid JSON data: ' + err.message);
    }
  });
});
