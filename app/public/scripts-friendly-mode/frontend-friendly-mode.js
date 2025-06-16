const templateSelect = document.getElementById('friendly-endpoint-select');
const formContainer = document.getElementById('formContainer');
const generatePdfBtn = document.getElementById('generateFriendlyBtn');
const friendlyResult = document.getElementById('friendlyResult');

let allSelectedFiles = [];
let userAccessType = 'basic'; 

function isValidYouTubeUrl(url) {
  const regex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/)[\w-]{11}$/;
  return regex.test(url.trim());
}

async function fetchAccessType() {
  const apiKey =
    new URLSearchParams(window.location.search).get('apiKey') ||
    localStorage.getItem('apiKey');

  if (!apiKey) return;

  try {
    const res = await fetch('/api/friendly/check-access', {
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      credentials: "include",
    });

    if (res.status === 401 || res.status === 403) {
    localStorage.removeItem("apiKey");
    window.location.href = "/login.html";
    return;
  }
    
    

    if (res.ok) {
      const data = await res.json();
      userAccessType = data.accessType === 'premium' ? 'premium' : 'basic';
    }
  } catch (err) {
    console.warn('Access check failed, falling back to basic.');
  }
}

function renderForm(template) {
  let html = '';
  const formContainer = document.getElementById('formContainer');
  if (!formContainer) {
    console.warn('No form container found!');
    return;
  }

  if (template === 'invoice') {
    html = `
      <label>Customer Name: <input id="customerName" name="customerName" /></label><br/>
      <label>Date: <input type="date" id="date" name="date" /></label><br/>
      <label>Invoice Number: <input id="invoiceNumber" name="invoiceNumber" /></label><br/>
      <label>Items (format: description,quantity,unitPrice per line):</label><br/>
      <textarea id="items" name="items" rows="5" cols="30" placeholder="e.g. Apple,2,1.50"></textarea><br/>
      <label>Tax Rate (%): <input type="number" id="taxRate" name="taxRate" value="0" /></label><br/>
    `;

    if (userAccessType === 'premium') {
      html += `
        <label>Company Name: <input id="companyName" name="companyName" /></label><br/>
        <label>Company Address: <input id="companyAddress" name="companyAddress" /></label><br/>
        <label>Company Email: <input id="companyEmail" name="companyEmail" type="email" /></label><br/>
        <label>Sender Address: <input id="senderAddress" name="senderAddress" /></label><br/>
        <label>Recipient Address: <input id="recipientAddress" name="recipientAddress" /></label><br/>
        <label>Upload Logo: <input type="file" id="logoUpload" name="logoUpload" accept="image/*" /></label><br/>
        <label>Extra Notes: <textarea id="notes" name="notes" rows="3" cols="30"></textarea></label><br/>
      `;
    }

    
    html += `<label><input type="checkbox" id="includeTitle" name="includeTitle" checked /> Include Title</label><br/>`;

  } else if (template === 'recipe') {
    html = `
      <label>Recipe Name: <input id="recipeName" name="recipeName" /></label><br/>
      <label>Prep Time: <input id="prepTime" name="prepTime" /></label><br/>
      <label>Cook Time: <input id="cookTime" name="cookTime" /></label><br/>
      <label>Ingredients (comma separated): <input id="ingredients" name="ingredients" /></label><br/>
      <label>Instructions (semicolon separated): <input id="instructions" name="instructions" /></label><br/>
    `;

    if (userAccessType === 'premium') {
      html += `
        <label>Recipe Video URL (YouTube): <input id="videoUrl" name="videoUrl" placeholder="https://youtube.com/..." /></label><br/>
        <fieldset>
          <legend>Nutrition Info (optional)</legend>
          <label>Calories: <input id="calories" name="calories" /></label><br/>
          <label>Protein: <input id="protein" name="protein" /></label><br/>
          <label>Fat: <input id="fat" name="fat" /></label><br/>
          <label>Carbs: <input id="carbs" name="carbs" /></label><br/>
        </fieldset>
        <label>Upload Images: <input type="file" id="imageUpload" name="imageUpload" accept="image/*" multiple /></label><br/>
        <div id="imagePreviewContainer" style="display:flex; gap:10px; flex-wrap: wrap; margin-bottom: 10px;"></div>
      `;
    }

    html += `<label><input type="checkbox" id="includeTitle" name="includeTitle" checked /> Include Title</label><br/>`;
  }

  

  allSelectedFiles = [];
  updateImagePreview();

  if (template === 'recipe' && userAccessType === 'premium') {
    const imageInput = document.getElementById('imageUpload');
    if (imageInput) {
      imageInput.addEventListener('change', onImagesSelected);
    }
  


    html += `<label><input type="checkbox" id="includeTitle" checked /> Include Title</label><br/>`;
  }

  formContainer.innerHTML = html;


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

generatePdfBtn.addEventListener('click', async () => {
  const template = templateSelect.value;
  let formData = {};

  try {
    if (template === 'invoice') {
      const logoInput = document.getElementById('logoUpload');
      let base64Logo = '';
    
      if (userAccessType === 'premium' && logoInput && logoInput.files.length > 0) {
        const file = logoInput.files[0];
        base64Logo = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = err => reject(err);
          reader.readAsDataURL(file);
        });

        
      }
    
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
        logoBase64: base64Logo || undefined,
        senderAddress: userAccessType === 'premium' ? document.getElementById('senderAddress')?.value : undefined,
        companyName: document.getElementById('companyName')?.value,
        companyAddress: document.getElementById('companyAddress')?.value,
        companyEmail: document.getElementById('companyEmail')?.value,
        recipientAddress: userAccessType === 'premium' ? document.getElementById('recipientAddress')?.value : undefined,
        notes: userAccessType === 'premium' ? document.getElementById('notes')?.value : undefined,
      };
    

    
    } else if (template === 'recipe') {

      const videoUrl = userAccessType === 'premium' ? document.getElementById('videoUrl')?.value.trim() : '';
      if (videoUrl && !isValidYouTubeUrl(videoUrl)) {
        throw new Error('Please enter a valid YouTube video URL.');
      }

      const base64Images = userAccessType === 'premium'
        ? await Promise.all(allSelectedFiles.map(file =>
            new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.readAsDataURL(file);
              reader.onload = () => resolve(reader.result);
              reader.onerror = error => reject(error);
            })
          ))
        : [];

      formData = {
        recipeName: document.getElementById('recipeName')?.value,
        prepTime: document.getElementById('prepTime')?.value,
        cookTime: document.getElementById('cookTime')?.value,
        ingredients: document.getElementById('ingredients')?.value.split(',').map(s => s.trim()),
        instructions: document.getElementById('instructions')?.value.split(';').map(s => s.trim()),
        imageUrls: base64Images,
        includeTitle: document.getElementById('includeTitle')?.checked ?? false,

        videoUrl: videoUrl || undefined,
        nutrition: userAccessType === 'premium' ? {
          Calories: document.getElementById('calories')?.value || undefined,
          Protein: document.getElementById('protein')?.value || undefined,
          Fat: document.getElementById('fat')?.value || undefined,
          Carbs: document.getElementById('carbs')?.value || undefined,
        } : undefined
      };
    }

    friendlyResult.textContent = 'Generating PDF...';

    const apiKey =
      new URLSearchParams(window.location.search).get('apiKey') ||
      localStorage.getItem('apiKey');

    if (!apiKey) throw new Error('API key missing. Please log in or use a valid access link.');

    const response = await fetch('/api/friendly/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ template, ...formData }),
      credentials: "include",
    });

  if (response.status === 401 || response.status === 403) {
  localStorage.removeItem("apiKey");
  window.location.href = "/login.html";
  return;
}


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

templateSelect.addEventListener('change', () => {
  renderForm(templateSelect.value);
});

(async () => {
  await fetchAccessType();
  renderForm(templateSelect.value);
})();