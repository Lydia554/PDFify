export function initBuyTokens(apiKeyElementId = 'apiKey', resultElementId = 'token-purchase-result') {
  const buttons = document.querySelectorAll('.token-pack-btn');
  const resultEl = document.getElementById(resultElementId);

  if (!buttons.length) return;

  buttons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const apiKey = document.getElementById(apiKeyElementId)?.value || localStorage.getItem('apiKey');
      if (!apiKey) {
        alert('Please provide your API key');
        return;
      }

      const pack = btn.dataset.pack;
      resultEl.textContent = 'Redirecting to payment...';

      try {
        const response = await fetch('/api/stripe/buy-tokens', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({ pack }),
          credentials: 'include',
        });

        if (!response.ok) {
          const error = await response.json();
          console.error("Error creating token checkout session:", error);
          resultEl.textContent = `❌ Error: ${error.error || "Failed to create checkout session"}`;
          return;
        }

        const { url } = await response.json();
        if (!url) {
          resultEl.textContent = '❌ Error: No checkout URL returned from backend.';
          return;
        }

        window.location.href = url;
      } catch (err) {
        console.error("Unexpected error:", err);
        resultEl.textContent = '❌ An unexpected error occurred. Please try again.';
      }
    });
  });
}
