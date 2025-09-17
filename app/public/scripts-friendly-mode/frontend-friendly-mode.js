const templateSelect = document.getElementById('friendly-endpoint-select');
const formContainer = document.getElementById('formContainer');
const generatePdfBtn = document.getElementById('generateFriendlyBtn');
const friendlyResult = document.getElementById('friendlyResult');

let allSelectedFiles = [];
let userAccessType = 'free'; 
let isAdvanced = false; 

function isValidYouTubeUrl(url) {
  const regex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/)[\w-]{11}(\S*)?$/;
  return regex.test(url.trim());
}


async function fetchAccessType() {
  const apiKey =
    new URLSearchParams(window.location.search).get('apiKey') ||
    localStorage.getItem('apiKey');
  if (!apiKey) return;

  if (window.FORCE_PLAN && window.FORCE_PLAN.trim() !== '') {
    userAccessType = window.FORCE_PLAN.trim();
    isAdvanced = ['premium', 'pro'].includes(userAccessType);
    console.log(`Using forced plan from frontend: ${userAccessType}`);
    return;
  }

  try {
    const res = await fetch('/api/user/me', {
      headers: { Authorization: `Bearer ${apiKey}` },
      credentials: 'include',
    });

    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem('apiKey');
      window.location.href = '/login.html';
      return;
    }

    if (res.ok) {
      const data = await res.json();
      userAccessType = data.accessType || data.planType?.toLowerCase() || 'free';
      isAdvanced = ['premium', 'pro'].includes(userAccessType);
      console.log('Access type from backend:', userAccessType);
    }
  } catch (err) {
    console.warn('Access check failed, falling back to basic.');
    userAccessType = 'free';
    isAdvanced = false;
  }
}

function renderForm(template) {
  let html = '';

  if (template === 'invoice') {
    html = `
      <label class="block text-white mb-1 font-semibold">Customer Name: <input id="customerName" class="w-full p-1 rounded border border-gray-400 text-black"/></label>
      <label class="block text-white mb-1 font-semibold">Date: <input type="date" id="date" class="w-full p-1 rounded border border-gray-400 text-black"/></label>
      <label class="block text-white mb-1 font-semibold">Invoice Number: <input id="invoiceNumber" class="w-full p-1 rounded border border-gray-400 text-black"/></label>
      <label class="block text-white mb-1 font-semibold">Items (desc,qty,unitPrice per line):</label>
      <textarea id="items" rows="5" class="w-full p-1 rounded border border-gray-400 text-black" placeholder="e.g. Apple,2,1.50"></textarea>
      <label class="block text-white mb-1 font-semibold">Tax Rate (%): <input type="number" id="taxRate" value="0" class="p-1 rounded border border-gray-400 text-black"/></label>

      <fieldset class="advanced-only border border-gray-500 p-3 rounded mt-4 text-white">
        <legend class="font-semibold mb-2">Business Details</legend>
        <label class="block mb-1">Invoice Language:
          <select id="invoiceLanguage" class="w-full p-1 rounded border border-gray-400 text-black">
            <option value="en">English</option>
            <option value="de">Deutsch</option>
            <option value="sl">Slovenščina</option>
          </select>
        </label>
        <label class="block mb-1">Company Name: <input id="companyName" class="w-full p-1 rounded border border-gray-400 text-black"/></label>
        <label class="block mb-1">Company Email: <input id="companyEmail" type="email" class="w-full p-1 rounded border border-gray-400 text-black"/></label>
        <label class="block mb-1">Sender Address: <input id="senderAddress" class="w-full p-1 rounded border border-gray-400 text-black"/></label>
        <label class="block mb-1">Recipient Address: <input id="recipientAddress" class="w-full p-1 rounded border border-gray-400 text-black"/></label>
        <label class="block mb-1">Upload Logo: <input type="file" id="logoUpload" accept="image/*" class="w-full text-white"/></label>
        <label class="block mb-1">Extra Notes: <textarea id="notes" rows="3" class="w-full p-1 rounded border border-gray-400 text-black"></textarea></label>
      </fieldset>

      <label class="block text-white mt-3"><input type="checkbox" id="includeTitle" checked /> Include Title</label>
    `;
  } else if (template === 'recipe') {
    html = `
      <label class="block text-white mb-1 font-semibold">Recipe Name: <input id="recipeName" class="w-full p-1 rounded border border-gray-400 text-black"/></label>
      <label class="block text-white mb-1 font-semibold">Prep Time: <input id="prepTime" class="w-full p-1 rounded border border-gray-400 text-black"/></label>
      <label class="block text-white mb-1 font-semibold">Cook Time: <input id="cookTime" class="w-full p-1 rounded border border-gray-400 text-black"/></label>
      <label class="block text-white mb-1 font-semibold">Ingredients (comma separated):</label>
      <textarea id="ingredients" class="w-full p-1 rounded border border-gray-400 text-black resize-none min-h-[400px]" placeholder="e.g. Flour, Sugar, Eggs"></textarea>
      <label class="block text-white mb-1 font-semibold">Instructions (semicolon separated):</label>
      <textarea id="instructions" class="w-full p-1 rounded border border-gray-400 text-black resize-none min-h-[400px]" placeholder="e.g. Preheat oven; Mix ingredients; Bake for 30 minutes"></textarea>

      <fieldset class="advanced-only border border-gray-500 p-3 rounded mt-4 text-white">
        <legend class="font-semibold mb-2">Media & Nutrition</legend>
        <label class="block mb-1">Recipe Video URL (YouTube): <input id="videoUrl" placeholder="https://youtube.com/..." class="w-full p-1 rounded border border-gray-400 text-black"/></label>
        <fieldset class="border border-gray-600 p-2 rounded mb-3">
          <legend class="font-semibold mb-1">Nutrition Info (optional)</legend>
          <label class="block mb-1">Calories: <input id="calories" class="p-1 rounded border border-gray-400 text-black"/></label>
          <label class="block mb-1">Protein: <input id="protein" class="p-1 rounded border border-gray-400 text-black"/></label>
          <label class="block mb-1">Fat: <input id="fat" class="p-1 rounded border border-gray-400 text-black"/></label>
          <label class="block mb-1">Carbs: <input id="carbs" class="p-1 rounded border border-gray-400 text-black"/></label>
        </fieldset>
        <label class="block mb-1">Upload Images: <input type="file" id="imageUpload" accept="image/*" multiple class="w-full text-white"/></label>
        <div id="imagePreviewContainer" class="flex gap-2 flex-wrap mb-2"></div>
      </fieldset>

      <label class="block text-white mt-3"><input type="checkbox" id="includeTitle" checked /> Include Title</label>
    `;
  }

  formContainer.innerHTML = html;
  allSelectedFiles = [];
  updateImagePreview();


  const advancedFields = formContainer.querySelectorAll('.advanced-only input, .advanced-only textarea, .advanced-only select, .advanced-only button');
  advancedFields.forEach(el => {
    el.disabled = !isAdvanced;
    el.style.opacity = isAdvanced ? '1' : '0.5';
    el.title = isAdvanced ? '' : 'Available in Premium or Pro only';
  });

  if (template === 'recipe' && isAdvanced) {
    const imageInput = document.getElementById('imageUpload');
    if (imageInput) imageInput.addEventListener('change', onImagesSelected);
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
    reader.onload = e => { img.src = e.target.result; };
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
      if (isAdvanced && logoInput?.files.length > 0) {
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
        items: document.getElementById('items')?.value.split('\n').map(line => {
          const [description, quantity, unitPrice] = line.split(',').map(s => s.trim());
          return {
            description,
            quantity: parseFloat(quantity),
            unitPrice: parseFloat(unitPrice),
          };
        }).filter(item => item.description && !isNaN(item.quantity) && !isNaN(item.unitPrice)),
        logo: base64Logo || undefined,
        invoiceLanguage: isAdvanced ? document.getElementById('invoiceLanguage')?.value : 'en',
        senderAddress: isAdvanced ? document.getElementById('senderAddress')?.value : undefined,
        companyName: isAdvanced ? document.getElementById('companyName')?.value : undefined,
        companyEmail: isAdvanced ? document.getElementById('companyEmail')?.value : undefined,
        recipientAddress: isAdvanced ? document.getElementById('recipientAddress')?.value : undefined,
        notes: isAdvanced ? document.getElementById('notes')?.value : undefined,
      };
    } else if (template === 'recipe') {
      const videoUrl = isAdvanced ? document.getElementById('videoUrl')?.value.trim() : '';
      if (videoUrl && !isValidYouTubeUrl(videoUrl)) throw new Error('Please enter a valid YouTube video URL.');

      const base64Images = isAdvanced
        ? await Promise.all(allSelectedFiles.map(file =>
            new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.readAsDataURL(file);
              reader.onload = () => resolve(reader.result);
              reader.onerror = err => reject(err);
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
        nutrition: isAdvanced ? {
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
      credentials: 'include',
    });

    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('apiKey');
      window.location.href = '/login.html';
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


// Template change handler
templateSelect.addEventListener('change', () => renderForm(templateSelect.value));

// Initialize
(async () => {
  await fetchAccessType();
  renderForm(templateSelect.value);
})();
