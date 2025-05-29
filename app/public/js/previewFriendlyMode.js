document.addEventListener('DOMContentLoaded', () => {
  const previewDevBtn = document.getElementById('previewDevBtn');
  const previewFriendlyBtn = document.getElementById('previewFriendlyBtn');
  const iframe = document.getElementById('previewFrame');


  // These should match your backend route logic
const basicTemplates = ['invoice', 'recipe']; 
const premiumTemplates = ['invoice-premium', 'recipe-premium'];

// Assume this is injected server-side or fetched earlier
const userStatus = document.getElementById('userStatus')?.value || 'free'; 
// Or use a global JS variable like `window.userStatus = 'free'`



  previewDevBtn?.addEventListener('click', async () => {
    const endpoint = document.getElementById('endpoint').value;
    const apiKey = document.getElementById('apiKey').value.trim();
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

      if (iframe) {
        iframe.src = pdfUrl;
        iframe.style.display = 'block';
        iframe.style.width = '100%';
        iframe.style.height = '600px';
      } else {
        window.open(pdfUrl, '_blank');
      }
    } catch (err) {
      alert('Invalid JSON data: ' + err.message);
    }
  });


  previewFriendlyBtn?.addEventListener('click', async () => {
    const selectedTemplate = document.getElementById('friendly-endpoint-select').value;
    const apiKey = document.getElementById('apiKey').value.trim();
    const payload = await getFriendlyFormData();
  
    payload.template = selectedTemplate;
  
    // Block free users from previewing premium templates
    if (premiumTemplates.includes(selectedTemplate) && userStatus === 'free') {
      alert('This is a premium template. Upgrade your plan to preview it.');
      return;
    }
  
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
  
      if (iframe) {
        iframe.src = pdfUrl;
        iframe.style.display = 'block';
        iframe.style.width = '100%';
        iframe.style.height = '600px';
      } else {
        window.open(pdfUrl, '_blank');
      }
    } catch (err) {
      alert('Error generating preview: ' + err.message);
    }
  });
  

  
  async function getFriendlyFormData() {
    const formContainer = document.getElementById('formContainer');
    if (!formContainer) {

      return {};
    }
  
    const inputs = formContainer.querySelectorAll('input, textarea, select');

    const data = {};
    const items = [];
    
    for (const input of inputs) {
      if (!input.name) continue;
    
      if (input.type === 'file' && input.files.length > 0) {
        const file = input.files[0];
        const base64 = await fileToBase64(file);
        data[input.name] = base64;
      } else {
        const name = input.name;
    
        
        const arrayMatch = name.match(/^(\w+)\[(\d+)\]$/);
        const nestedMatch = name.match(/^(\w+)\[(\d+)\]\.(\w+)$/);
        const objectMatch = name.match(/^(\w+)\[(\w+)\]$/);
    
        if (nestedMatch) {
          const [_, base, idx, key] = nestedMatch;
          if (!data[base]) data[base] = [];
          if (!data[base][idx]) data[base][idx] = {};
          data[base][idx][key] = input.value;
        } else if (arrayMatch) {
          const [_, base, idx] = arrayMatch;
          if (!data[base]) data[base] = [];
          data[base][idx] = input.value;
        } else if (objectMatch) {
          const [_, objName, key] = objectMatch;
          if (!data[objName]) data[objName] = {};
          data[objName][key] = input.value;
        } else {
          data[name] = input.value;
        }
      }
    }
    
  
    if (items.length > 0) data.items = items;

    return data;
  }
  
  
  
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
});
