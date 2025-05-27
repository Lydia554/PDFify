document.addEventListener('DOMContentLoaded', () => {
  const previewFriendlyBtn = document.getElementById('previewFriendlyBtn');
  const formContainer = document.getElementById('formContainer');
  const friendlyTemplateSelect = document.getElementById('friendly-endpoint-select');
  
  function renderForm(template) {
    formContainer.innerHTML = ''; // Clear previous
    if (template === 'invoice') {
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
    else if (template === 'recipe') {
      // Render recipe form here similarly...
    }
  }
  
  // Initial render on page load
  renderForm(friendlySelect.value);
  
  // Update form when template selection changes
  friendlySelect.addEventListener('change', () => {
    renderForm(friendlySelect.value);
  });
  

  // Collect form data from inputs
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

    if (items.length > 0) data.items = items;

    return data;
  }

  // Convert file to base64 string
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Event: On template change, re-render form
  friendlyTemplateSelect?.addEventListener('change', () => {
    renderFriendlyForm();
  });

  // Initial form render on page load
  renderFriendlyForm();

  // Event: Preview Friendly Mode button clicked
  previewFriendlyBtn?.addEventListener('click', async () => {
    const selectedTemplate = friendlyTemplateSelect.value;
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

      // Open PDF preview in new tab/window
      window.open(pdfUrl, '_blank');
    } catch (err) {
      alert('Error generating preview: ' + err.message);
    }
  });
});
