// Render preview inside iframe
function renderPreview(jsonStr, endpoint) {
  if (!endpoint || !jsonStr) {
    alert("Please select an endpoint and provide JSON.");
    return;
  }

  let html = "<p>Preview not available.</p>";

  try {
    const parsed = JSON.parse(jsonStr);
    const data = parsed.data || {};
    const rawHtml = parsed.html || "";

    switch (endpoint) {
      case "generate-invoice":
        html = generateInvoiceHTML(data);
        break;
      case "generate-recipe":
        html = generateRecipeHTML(data);
        break;
      case "generate-therapy-report":
        html = generateTherapyReportHTML(data);
        break;
      case "generate-shop-order":
        html = generateShopOrderHTML(data);
        break;
      case "generate-packing-slip":
        html = generatePackingSlipHTML(data);
        break;
      case "generate-pdf-from-html":
        html = rawHtml || "<p>No HTML provided</p>";
        break;
      default:
        html = "<p>Unknown endpoint.</p>";
    }
  } catch (e) {
    console.error("Preview error:", e);
    html = `<pre style="color:red">Invalid JSON or HTML</pre>`;
  }

  const previewFrame = document.getElementById("previewFrame");
  const doc = previewFrame.contentDocument || previewFrame.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
}

// Developer Mode Preview button handler
document.getElementById("previewDevBtn").addEventListener("click", () => {
  const endpointSelect = document.getElementById("endpoint");
  const endpoint = endpointSelect.value ? `generate-${endpointSelect.value}` : null;

  const jsonInput = document.getElementById("json").value;

  renderPreview(jsonInput, endpoint);
});

// Friendly Mode Preview button handler
function previewFriendly() {
  const endpointSelect = document.getElementById("friendly-endpoint-select");
  const endpointKey = endpointSelect.value;
  const endpoint = `generate-${endpointKey}`;

  let data = {};

  if (endpointKey === "invoice") {
    data = {
      customerName: document.getElementById("invoice-customerName")?.value || "N/A",
      customerEmail: document.getElementById("invoice-customerEmail")?.value || "",
      orderId: document.getElementById("invoice-orderId")?.value || "",
      date: document.getElementById("invoice-date")?.value || "",
      items: [
        {
          name: document.getElementById("invoice-item1-name")?.value || "Item 1",
          quantity: parseInt(document.getElementById("invoice-item1-qty")?.value) || 1,
          price: document.getElementById("invoice-item1-price")?.value || "0",
        }
      ],
      subtotal: document.getElementById("invoice-subtotal")?.value || "0",
      tax: document.getElementById("invoice-tax")?.value || "0",
      total: document.getElementById("invoice-total")?.value || "0",
      customLogoUrl: document.getElementById("invoice-logo")?.value || "",
      showChart: document.getElementById("invoice-showChart")?.checked || false,
      isPremium: true
    };
  }

  // Add other cases for recipe, therapy report, etc.

  const jsonString = JSON.stringify({ data });

  renderPreview(jsonString, endpoint);
}

document.getElementById("previewFriendlyBtn").addEventListener("click", previewFriendly);


// Example generators for invoice and recipe (simplified)
function generateInvoiceHTML(data) {
  return `
    <html><body>
      <h1>Invoice for ${data.customerName || "N/A"}</h1>
      <p>Date: ${data.date || "N/A"}</p>
      <ul>
        ${data.items ? data.items.map(i => `<li>${i.name} - Qty: ${i.quantity} - Price: $${i.price}</li>`).join("") : ""}
      </ul>
      <p>Total: $${data.total || "0"}</p>
    </body></html>
  `;
}

function generateRecipeHTML(data) {
  return `
    <html><body>
      <h1>${data.title || "Recipe"}</h1>
      <p>${data.description || ""}</p>
    </body></html>
  `;
}
