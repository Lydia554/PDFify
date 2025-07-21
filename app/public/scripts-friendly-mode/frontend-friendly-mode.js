const templateSelect = document.getElementById('templateSelect');
const formContainer = document.getElementById('formContainer');
const generatePdfBtn = document.getElementById('generatePdfBtn');
const friendlyResult = document.getElementById('friendlyResult');

let allSelectedFiles = [];
let userAccessType = 'basic'; // default

// Change this variable to force a plan in production for testing ONLY
// E.g. 'basic', 'premium', 'pro' or null to disable forcing
// This override only activates if NODE_ENV === 'production'
const forcePlan = 'pro'; // set to 'basic' or 'premium' or 'pro' for forced plan in production, null to disable

async function fetchAccessType() {
  try {
    const res = await fetch('/api/friendly/check-access', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      userAccessType = data.accessType || 'basic';
    } else {
      userAccessType = 'basic';
    }
  } catch {
    userAccessType = 'basic';
  }

  // Override userAccessType if forced plan active and in production env
  // (simulate production check, replace with your actual env check if needed)
  if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'production') {
    if (forcePlan && ['basic', 'premium', 'pro'].includes(forcePlan)) {
      userAccessType = forcePlan;
      console.log(`[DEBUG] User access forced to: ${forcePlan}`);
    }
  }

  togglePremiumFields();
}

function togglePremiumFields() {
  // Premium + Pro users get enabled premium fields
  const premiumFields = document.querySelectorAll('.premium-only');
  premiumFields.forEach(fieldset => {
    if (userAccessType === 'premium' || userAccessType === 'pro') {
      fieldset.querySelectorAll('input, select, textarea, button').forEach(el => {
        el.disabled = false;
      });
      fieldset.style.opacity = '1';
      fieldset.title = '';
    } else {
      // basic users disabled premium fields
      fieldset.querySelectorAll('input, select, textarea, button').forEach(el => {
        el.disabled = true;
      });
      fieldset.style.opacity = '0.6';
      fieldset.title = 'Available in Premium and Pro plans only';
    }
  });
}

function isValidYouTubeUrl(url) {
  const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
  return ytRegex.test(url);
}

function renderForm(template) {
  let html = '';
  if (template === 'invoice') {
    html = `
   
      <label class="block text-white mb-1 font-semibold">Customer Name: <input id="customerName" name="customerName" class="w-full p-1 rounded border border-gray-400 text-black"/></label>
      <label class="block text-white mb-1 font-semibold">Date: <input type="date" id="date" name="date" class="w-full p-1 rounded border border-gray-400 text-black"/></label>
      <label class="block text-white mb-1 font-semibold">Invoice Number: <input id="invoiceNumber" name="invoiceNumber" class="w-full p-1 rounded border border-gray-400 text-black"/></label>
      <label class="block text-white mb-1 font-semibold">Items (format: description,quantity,unitPrice per line):</label>
      <textarea id="items" name="items" rows="5" class="w-full p-1 rounded border border-gray-400 text-black" placeholder="e.g. Apple,2,1.50"></textarea>
      <label class="block text-white mb-1 font-semibold">Tax Rate (%): <input type="number" id="taxRate" name="taxRate" value="0" class="p-1 rounded border border-gray-400 text-black"/></label>

   <fieldset class="premium-only border border-gray-500 p-3 rounded mt-4 text-white">
  <legend class="font-semibold mb-2">Business Details</legend>

  <label class="block mb-1">Invoice Language:
    <select id="invoiceLanguage" name="invoiceLanguage" class="w-full p-1 rounded border border-gray-400 text-black">
      <option value="en">English</option>
      <option value="de">Deutsch</option>
      <option value="sl">Slovenščina</option>
    </select>
  </label>

        <label class="block mb-1">Company Name: <input id="companyName" name="companyName" class="w-full p-1 rounded border border-gray-400 text-black"/></label>
        <label class="block mb-1">Company Address: <input id="companyAddress" name="companyAddress" class="w-full p-1 rounded border border-gray-400 text-black"/></label>
        <label class="block mb-1">Company Email: <input id="companyEmail" name="companyEmail" type="email" class="w-full p-1 rounded border border-gray-400 text-black"/></label>
        <label class="block mb-1">Sender Address: <input id="senderAddress" name="senderAddress" class="w-full p-1 rounded border border-gray-400 text-black"/></label>
        <label class="block mb-1">Recipient Address: <input id="recipientAddress" name="recipientAddress" class="w-full p-1 rounded border border-gray-400 text-black"/></label>
        <label class="block mb-1">Upload Logo: <input type="file" id="logoUpload" name="logoUpload" accept="image/*" class="w-full text-white"/></label>
        <label class="block mb-1">Extra Notes: <textarea id="notes" name="notes" rows="3" class="w-full p-1 rounded border border-gray-400 text-black"></textarea></label>
      
      </fieldset>
      <label class="block text-white mt-3"><input type="checkbox" id="includeTitle" name="includeTitle" checked /> Include Title</label>
    `;
  } else if (template === 'recipe') {
    html = `
      <label class="block text-white mb-1 font-semibold">Recipe Name: <input id="recipeName" name="recipeName" class="w-full p-1 rounded border border-gray-400 text-black"/></label>
      <label class="block text-white mb-1 font-semibold">Prep Time: <input id="prepTime" name="prepTime" class="w-full p-1 rounded border border-gray-400 text-black"/></label>
      <label class="block text-white mb-1 font-semibold">Cook Time: <input id="cookTime" name="cookTime" class="w-full p-1 rounded border border-gray-400 text-black"/></label>
     <label class="block text-white mb-1 font-semibold">Ingredients (comma separated):</label>
<textarea id="ingredients" name="ingredients" class="w-full p-1 rounded border border-gray-400 text-black resize-none min-h-[400px]" placeholder="e.g. Flour, Sugar, Eggs"></textarea>

<label class="block text-white mb-1 font-semibold">Instructions (semicolon separated):</label>
<textarea id="instructions" name="instructions" class="w-full p-1 rounded border border-gray-400 text-black resize-none min-h-[400px]" placeholder="e.g. Preheat oven; Mix ingredients; Bake for 30 minutes"></textarea>


      <fieldset class="premium-only border border-gray-500 p-3 rounded mt-4 text-white">
        <legend class="font-semibold mb-2">Media & Nutrition</legend>
        <label class="block mb-1">Recipe Video URL (YouTube): <input id="videoUrl" name="videoUrl" placeholder="https://youtube.com/..." class="w-full p-1 rounded border border-gray-400 text-black"/></label>
        <fieldset class="border border-gray-600 p-2 rounded mb-3">
          <legend class="font-semibold mb-1">Nutrition Info (optional)</legend>
          <label class="block mb-1">Calories: <input id="calories" name="calories" class="p-1 rounded border border-gray-400 text-black"/></label>
          <label class="block mb-1">Protein: <input id="protein" name="protein" class="p-1 rounded border border-gray-400 text-black"/></label>
          <label class="block mb-1">Fat: <input id="fat" name="fat" class="p-1 rounded border border-gray-400 text-black"/></label>
          <label class="block mb-1">Carbs: <input id="carbs" name="carbs" class="p-1 rounded border border-gray-400 text-black"/></label>
        </fieldset>
        <label class="block mb-1">Upload Images: <input type="file" id="imageUpload" name="imageUpload" accept="image/*" multiple class="w-full text-white"/></label>
        <div id="imagePreviewContainer" class="flex gap-2 flex-wrap mb-2"></div>
      </fieldset>
      <label class="block text-white mt-3"><input type="checkbox" id="includeTitle" name="includeTitle" checked /> Include Title</label>
    `;
  }



  
  formContainer.innerHTML = html;
  allSelectedFiles = [];
  updateImagePreview();

  if (template === 'recipe' && userAccessType === 'premium') {
    const imageInput = document.getElementById('imageUpload');
    if (imageInput) {
      imageInput.addEventListener('change', onImagesSelected);
    }
  }

  if (userAccessType === 'basic') {
    const premiumFields = formContainer.querySelectorAll('.premium-only input, .premium-only textarea, .premium-only select, .premium-only button');
    premiumFields.forEach(el => {
      el.disabled = true;
      el.style.opacity = '0.5';
      el.title = 'Available in Premium only';
    });
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
      if (userAccessType === 'premium' && logoInput?.files.length > 0) {
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
        logoBase64: base64Logo || undefined,
          invoiceLanguage: document.getElementById('invoiceLanguage')?.value || 'en',
        senderAddress: userAccessType === 'premium' ? document.getElementById('senderAddress')?.value : undefined,
        companyName: document.getElementById('companyName')?.value,
        companyAddress: document.getElementById('companyAddress')?.value,
        companyEmail: document.getElementById('companyEmail')?.value,
        recipientAddress: userAccessType === 'premium' ? document.getElementById('recipientAddress')?.value : undefined,
        notes: userAccessType === 'premium' ? document.getElementById('notes')?.value : undefined,
      };
      if (formData.logoBase64) {
        formData.logo = formData.logoBase64;
        delete formData.logoBase64;
      }
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


