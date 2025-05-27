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
    const template = document.getElementById('friendly-endpoint-select').value;

    const apiKey = document.getElementById('apiKey').value.trim();

    const payload = getFriendlyFormData();

    try {
      const response = await fetch(`/api/generate-${template}`, {
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

  // Dummy example of how to collect Friendly Mode form data
  function getFriendlyFormData() {
    const formContainer = document.getElementById('formContainer');
    const inputs = formContainer.querySelectorAll('input, textarea, select');
    const data = {};
    inputs.forEach(input => {
      data[input.name] = input.value;
    });
    return data;
  }
});
