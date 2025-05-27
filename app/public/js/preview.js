document.addEventListener('DOMContentLoaded', () => {
  const previewDevBtn = document.getElementById('previewDevBtn');
  const previewFriendlyBtn = document.getElementById('previewFriendlyBtn');
  const iframe = document.getElementById('previewFrame');

  // Helper to open PDF (in iframe if exists, else new tab)
  function openPdf(blob) {
    const pdfUrl = URL.createObjectURL(blob);
    if (iframe) {
      iframe.src = pdfUrl;
      iframe.style.display = 'block';
      iframe.style.width = '100%';
      iframe.style.height = '600px';
    } else {
      window.open(pdfUrl, '_blank');
    }
  }

  // Developer mode: parse raw JSON and send to endpoint
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
      openPdf(blob);
    } catch (err) {
      alert('Invalid JSON data: ' + err.message);
    }
  });

  // Friendly mode: gather form data and send to friendly endpoint
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
      openPdf(blob);
    } catch (err) {
      alert('Error generating preview: ' + err.message);
    }
  });

  // Collect all friendly mode form data from #formContainer
  async function getFriendlyFormData() {
    const formContainer = document.getElementById('formContainer');
    const data = {};

    // Gather flat inputs and textareas (excluding items)
    const flatInputs = formContainer.querySelectorAll('input:not([name^="item"]), textarea:not([name^="item"])');
    flatInputs.forEach(input => {
      if (!input.name) return;

      if (input.type === 'checkbox') {
        data[input.name] = input.checked;
      } else {
        data[input.name] = input.value;
      }
    });

    // Build items array from .item-row elements
    data.items = [];
    const itemRows = formContainer.querySelectorAll('.item-row');
    itemRows.forEach(row => {
      const description = row.querySelector('[name="itemDescription"]')?.value || '';
      const quantity = row.querySelector('[name="itemQuantity"]')?.value || 0;
      const unitPrice = row.querySelector('[name="itemUnitPrice"]')?.value || 0;

      // Only add if some data present
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
});
