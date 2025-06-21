window.addEventListener('DOMContentLoaded', () => {
  if (!localStorage.getItem('cookieConsent')) {
    const banner = document.createElement('div');
    banner.innerHTML = `
      <div style="position:fixed;bottom:0;left:0;right:0;padding:1em;background:#f8f9fa;border-top:1px solid #ccc;z-index:10000;text-align:center">
        We use cookies to improve your experience. <a href="/privacy-policy.html" target="_blank">Privacy Policy</a>.
        <button id="accept-cookies" style="margin-left:1em;">Accept</button>
      </div>
    `;
    document.body.appendChild(banner);

    document.getElementById('accept-cookies').addEventListener('click', () => {
      localStorage.setItem('cookieConsent', 'true');
      banner.remove();
    });
  }
});
