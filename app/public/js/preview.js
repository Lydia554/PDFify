document.addEventListener('DOMContentLoaded', () => {
  const previewDevBtn = document.getElementById('previewDevBtn');
  const previewFriendlyBtn = document.getElementById('previewFriendlyBtn');
  const iframe = document.getElementById('previewFrame');

  document.addEventListener('DOMContentLoaded', () => {
    const previewDevBtn = document.getElementById('previewDevBtn');
    const previewFriendlyBtn = document.getElementById('previewFriendlyBtn');
    const iframe = document.getElementById('previewFrame');
  
  
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
  
        window.open(pdfUrl, '_blank');

      } catch (err) {
        alert('Invalid JSON data: ' + err.message);
      }
    });
  
  
    previewFriendlyBtn?.addEventListener('click', async () => {
      const selectedTemplate = document.getElementById('friendly-endpoint-select').value;
      const apiKey = document.getElementById('apiKey').value.trim();
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
      const data = {};
    
      // Gather flat inputs and textareas (excluding items)
      const flatInputs = formContainer.querySelectorAll('input:not([name^="item"]), textarea:not([name^="item"])');
      flatInputs.forEach(input => {
        if (!input.name) return;
    
        if (input.type === 'file' && input.files.length > 0) {
          // If you have file inputs, handle base64 here
          // For now, skipping files
        } else if (input.type === 'checkbox') {
          data[input.name] = input.checked;
        } else {
          data[input.name] = input.value;
        }
      });
    
      // Build items array
      data.items = [];
      const itemRows = formContainer.querySelectorAll('.item-row');
    
      itemRows.forEach(row => {
        const description = row.querySelector('[name="itemDescription"]')?.value || '';
        const quantity = row.querySelector('[name="itemQuantity"]')?.value || 0;
        const unitPrice = row.querySelector('[name="itemUnitPrice"]')?.value || 0;
    
        if (description || quantity || unitPrice) {
          data.items.push({
            description,
            quantity: Number(quantity),
            unitPrice: Number(unitPrice),
          });
        }
      });
    
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
    const data = {};
  
    // Gather flat inputs and textareas (excluding items)
    const flatInputs = formContainer.querySelectorAll('input:not([name^="item"]), textarea:not([name^="item"])');
    flatInputs.forEach(input => {
      if (!input.name) return;
  
      if (input.type === 'file' && input.files.length > 0) {
        // If you have file inputs, handle base64 here
        // For now, skipping files
      } else if (input.type === 'checkbox') {
        data[input.name] = input.checked;
      } else {
        data[input.name] = input.value;
      }
    });
  
    // Build items array
    data.items = [];
    const itemRows = formContainer.querySelectorAll('.item-row');
  
    itemRows.forEach(row => {
      const description = row.querySelector('[name="itemDescription"]')?.value || '';
      const quantity = row.querySelector('[name="itemQuantity"]')?.value || 0;
      const unitPrice = row.querySelector('[name="itemUnitPrice"]')?.value || 0;
  
      if (description || quantity || unitPrice) {
        data.items.push({
          description,
          quantity: Number(quantity),
          unitPrice: Number(unitPrice),
        });
      }
    });
  
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
