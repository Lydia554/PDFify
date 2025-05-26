document.addEventListener('DOMContentLoaded', () => {
  const previewDevBtn = document.getElementById('previewDevBtn');
  const generateDevBtn = document.getElementById('generateDevBtn');
  const previewFriendlyBtn = document.getElementById('previewFriendlyBtn');
  const generateFriendlyBtn = document.getElementById('generateFriendlyBtn');
  const iframe = document.getElementById('previewFrame'); // Add this iframe in your HTML somewhere

  // Developer Mode Preview
  previewDevBtn?.addEventListener('click', async () => {
    const endpoint = document.getElementById('endpoint').value;
    const apiKey = document.getElementById('apiKey').value.trim();
    const jsonData = document.getElementById('json').value;

    try {
      const payload = JSON.parse(jsonData);
      // Call your backend API for preview (maybe use the same endpoint as generate, or add "?preview=true")
      const response = await fetch(`/api/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
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

      // Show preview in iframe or new tab
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

  // Friendly Mode Preview
  previewFriendlyBtn?.addEventListener('click', async () => {
    const template = document.getElementById('templateSelect').value;
    const apiKey = document.getElementById('apiKey').value.trim();

    // Collect form data from your friendly mode formContainer
    // Assuming you have a function `getFriendlyFormData()` that returns JSON object for current form
    const payload = getFriendlyFormData();

    try {
      const response = await fetch(`/api/generate-${template}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
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
    // Build JSON object from inputs inside formContainer
    // This depends on how your friendly mode forms are structured
    // Example:
    const inputs = formContainer.querySelectorAll('input, textarea, select');
    const data = {};
    inputs.forEach(input => {
      data[input.name] = input.value;
    });
    return data;
  }
});
