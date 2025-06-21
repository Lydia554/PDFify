window.addEventListener('DOMContentLoaded', () => {
  const consent = localStorage.getItem('cookieConsent');
  console.log('cookieConsent in localStorage:', consent);

  if (!consent) {
    console.log('No cookie consent found, showing banner...');
    const banner = document.createElement('div');
    banner.innerHTML = `
      <div style="position:fixed;bottom:0;left:0;right:0;padding:1em;background:#f8f9fa;border-top:1px solid #ccc;z-index:10000;text-align:center">
        We use cookies to improve your experience. <a href="/privacy-policy.html" target="_blank">Privacy Policy</a>.
        <button id="accept-cookies" style="margin-left:1em;">Accept</button>
      </div>
    `;
    document.body.appendChild(banner);

    document.getElementById('accept-cookies').addEventListener('click', () => {
      console.log('Accept button clicked, setting cookieConsent to true');
      localStorage.setItem('cookieConsent', 'true');

      // OPTIONAL: Send to backend if user is logged in or you want server-side record
      fetch('/api/user/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent: true })
      }).then(() => {
        console.log('Consent recorded on backend');
      }).catch((err) => {
        console.error('Error sending consent to backend:', err);
      });

      banner.remove();
    });
  } else {
    console.log('Cookie consent already given, no banner shown');
  }
});
