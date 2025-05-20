const templateSelect = document.getElementById('templateSelect');
const formContainer = document.getElementById('formContainer');
const generatePdfBtn = document.getElementById('generateFriendlyBtn');
const friendlyResult = document.getElementById('friendlyResult');

let allSelectedFiles = []; 

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
      <label>Prep Time: <input id="prepTime" /></label><br/>
      <label>Cook Time: <input id="cookTime" /></label><br/>
      <label>Ingredients (comma separated): <input id="ingredients" /></label><br/>
      <label>Instructions (semicolon separated): <input id="instructions" /></label><br/>
      <label>Author Name: <input id="authorName" /></label><br/>
      <label>Author Image URL: <input id="authorImageUrl" /></label><br/>
      <label>Video URL: <input id="videoUrl" /></label><br/>
      <fieldset>
        <legend>Nutrition Info (optional)</legend>
        <label>Calories: <input id="calories" /></label><br/>
        <label>Protein: <input id="protein" /></label><br/>
        <label>Fat: <input id="fat" /></label><br/>
        <label>Carbs: <input id="carbs" /></label><br/>
      </fieldset>
      <label>Upload Images: <input type="file" id="imageUpload" accept="image/*" multiple /></label><br/>
      <div id="imagePreviewContainer" style="display:flex; gap:10px; flex-wrap: wrap; margin-bottom: 10px;"></div>
      <label><input type="checkbox" id="includeTitle" checked /> Include Title</label><br/>
    `;

  }
  formContainer.innerHTML = html;

  allSelectedFiles = [];
  updateImagePreview();


  if (template === 'recipe') {
    const imageInput = document.getElementById('imageUpload');
    imageInput.addEventListener('change', onImagesSelected);
  }
}

function updateImagePreview() {
  const previewContainer = document.getElementById('imagePreviewContainer');
  if (!previewContainer) return;

  previewContainer.innerHTML = '';
  allSelectedFiles.forEach(file => {
    const img = document.createElement('img');
    img.style.maxWidth = '80px';
    img.style.maxHeight = '80px';
    img.style.borderRadius = '8px';
    img.style.objectFit = 'cover';

    const reader = new FileReader();
    reader.onload = e => {
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);

    previewContainer.appendChild(img);
  });
}

function onImagesSelected(event) {
  const newFiles = Array.from(event.target.files);


  newFiles.forEach(file => {
    if (!allSelectedFiles.some(f => f.name === file.name && f.size === file.size)) {
      allSelectedFiles.push(file);
    }
  });


  event.target.value = '';

  updateImagePreview();
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
      formData = {
        customerName: document.getElementById('customerName')?.value,
        date: document.getElementById('date')?.value,
        invoiceNumber: document.getElementById('invoiceNumber')?.value,
        taxRate: parseFloat(document.getElementById('taxRate')?.value || '0'),
        includeTitle: document.getElementById('includeTitle')?.checked ?? false,
        items: document.getElementById('items')?.value
          .split('\n')
          .map(line => {
            const [description, quantity, unitPrice] = line.split(',').map(s => s.trim());
            return {
              description,
              quantity: parseFloat(quantity),
              unitPrice: parseFloat(unitPrice),
            };
          })
          .filter(item => item.description && !isNaN(item.quantity) && !isNaN(item.unitPrice)),
      };
    } else if (template === 'recipe') {
      const includeTitle = document.getElementById('includeTitle');

      const base64Images = await Promise.all(
        allSelectedFiles.map(file => new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result);
          reader.onerror = error => reject(error);
        }))
      );

      formData = {
        recipeName: document.getElementById('recipeName')?.value,
        prepTime: document.getElementById('prepTime')?.value,
        cookTime: document.getElementById('cookTime')?.value,
        ingredients: document.getElementById('ingredients')?.value.split(',').map(s => s.trim()),
        instructions: document.getElementById('instructions')?.value.split(';').map(s => s.trim()),
        imageUrls: base64Images,
        includeTitle: includeTitle?.checked ?? false,
        authorName: document.getElementById('authorName')?.value || undefined,
        authorImageUrl: document.getElementById('authorImageUrl')?.value || undefined,
        videoUrl: document.getElementById('videoUrl')?.value || undefined,
        nutrition: {
          Calories: document.getElementById('calories')?.value || undefined,
          Protein: document.getElementById('protein')?.value || undefined,
          Fat: document.getElementById('fat')?.value || undefined,
          Carbs: document.getElementById('carbs')?.value || undefined,
        }
      };

    }

    friendlyResult.textContent = 'Generating PDF...';

    const apiKey =
      new URLSearchParams(window.location.search).get('apiKey') ||
      localStorage.getItem('apiKey');

    if (!apiKey) {
      throw new Error('API key missing. Please log in or use a valid access link.');
    }

    const response = await fetch('/api/friendly/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
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
    console.error('PDF Generation Error:', error);
    friendlyResult.textContent = `❌ Error: ${error.message}`;
  }
});
