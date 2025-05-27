document.addEventListener('DOMContentLoaded', () => {
  const previewDevBtn = document.getElementById('previewDevBtn');
  const previewFriendlyBtn = document.getElementById('previewFriendlyBtn');
  const iframe = document.getElementById('previewFrame');

  // Developer Mode preview
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
    const formContainer = document.getElementById('formContainer');
formContainer.innerHTML = ''; // Clear previous

if (selectedTemplate === 'invoice') {
  formContainer.innerHTML = `
    <input name="customerName" value="Lidija Jokić" />
    <input name="companyName" value="PDFify Inc." />
    <input name="date" value="2025-05-27" />
    <input name="invoiceNumber" value="INV-001" />
    <input name="items[0].description" value="Development Services" />
    <input name="items[0].quantity" value="1" />
    <input name="items[0].unitPrice" value="500" />
    <input name="subtotal" value="500" />
    <input name="taxRate" value="19" />
    <input name="taxAmount" value="95" />
    <input name="total" value="595" />
  `;
}

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

  // Collects all input data from Friendly Mode form
  async function getFriendlyFormData() {
    const formContainer = document.getElementById('formContainer');
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
});
