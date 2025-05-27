document.addEventListener('DOMContentLoaded', () => {
  const previewFriendlyBtn = document.getElementById('previewFriendlyBtn');
  const friendlyTemplateSelect = document.getElementById('friendly-endpoint-select');
  const formContainer = document.getElementById('formContainer');

  // Render form inputs for selected template
  function renderFriendlyForm() {
    const selectedTemplate = friendlyTemplateSelect.value;
    formContainer.innerHTML = ''; // Clear previous

    if (selectedTemplate === 'invoice') {
      formContainer.innerHTML = `
        <label>Customer Name: <input name="customerName" value="Lidija Jokić" /></label><br/>
        <label>Company Name: <input name="companyName" value="PDFify Inc." /></label><br/>
        <label>Date: <input name="date" value="2025-05-27" type="date" /></label><br/>
        <label>Invoice Number: <input name="invoiceNumber" value="INV-001" /></label><br/>
        <fieldset>
          <legend>Items</legend>
          <label>Description: <input name="items[0].description" value="Development Services" /></label><br/>
          <label>Quantity: <input name="items[0].quantity" value="1" type="number" min="1" /></label><br/>
          <label>Unit Price: <input name="items[0].unitPrice" value="500" type="number" step="0.01" /></label><br/>
        </fieldset>
        <label>Subtotal: <input name="subtotal" value="500" type="number" step="0.01" /></label><br/>
        <label>Tax Rate (%): <input name="taxRate" value="19" type="number" step="0.01" /></label><br/>
        <label>Tax Amount: <input name="taxAmount" value="95" type="number" step="0.01" /></label><br/>
        <label>Total: <input name="total" value="595" type="number" step="0.01" /></label><br/>
      `;
    }
    // Add more templates here if needed
  }

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
