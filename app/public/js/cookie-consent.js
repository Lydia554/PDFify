window.addEventListener('DOMContentLoaded', () => {
  if (!localStorage.getItem('cookieConsent')) {
    const banner = document.createElement('div');
    banner.innerHTML = `
      <div style="
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        padding: 1em 2em;
        background: #222;
        color: #eee;
        font-family: Arial, sans-serif;
        font-size: 14px;
        border-top: 3px solid #4CAF50;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        z-index: 10000;
        box-shadow: 0 -2px 10px rgba(0,0,0,0.3);
      ">
        <span>
          We use cookies to improve your experience. 
          <a href="/privacy-policy.html" target="_blank" style="color: #4CAF50; text-decoration: underline;">Privacy Policy</a>.
        </span>
  <button id="accept-cookies" style="
  background-color: #4CAF50;
  border: none;
  color: white;
  padding: 6px 12px;     /* reduced padding */
  font-size: 14px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.3s ease;
  min-width: 80px;       /* ensures it’s not too narrow */
  max-width: 120px;      /* prevents it from getting too wide */
  white-space: nowrap;   /* prevent wrapping */
">
  Accept


        </button>
      </div>
    `;
    document.body.appendChild(banner);

    const acceptBtn = document.getElementById('accept-cookies');
    acceptBtn.addEventListener('click', () => {
      localStorage.setItem('cookieConsent', 'true');

      fetch('/api/user/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent: true })
      }).catch(() => {});

      banner.remove();
    });

    acceptBtn.addEventListener('mouseenter', () => {
      acceptBtn.style.backgroundColor = '#45a049';
    });
    acceptBtn.addEventListener('mouseleave', () => {
      acceptBtn.style.backgroundColor = '#4CAF50';
    });
  }
});
