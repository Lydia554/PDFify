// preview.js

// Render preview inside iframe based on JSON string and endpoint
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

// Developer Mode Preview button: use textarea JSON and selected endpoint
document.getElementById("previewDevBtn").addEventListener("click", () => {
  const endpointSelect = document.getElementById("endpoint");
  const endpoint = endpointSelect.value ? `generate-${endpointSelect.value}` : null;
  const jsonInput = document.getElementById("json").value.trim();

  renderPreview(jsonInput, endpoint);
});

// Friendly Mode Preview button: build JSON from form inputs, then preview
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

  if (endpointKey === "recipe") {
    data = {
      title: document.getElementById("recipe-title")?.value || "Recipe Title",
      description: document.getElementById("recipe-description")?.value || "",
      ingredients: document.getElementById("recipe-ingredients")?.value || "",
      instructions: document.getElementById("recipe-instructions")?.value || ""
    };
  }

  // Add other templates similarly here if needed

  const jsonString = JSON.stringify({ data });

  renderPreview(jsonString, endpoint);
}

document.getElementById("previewFriendlyBtn").addEventListener("click", previewFriendly);


// ======= HTML Generators =======

// Invoice HTML generator
function generateInvoiceHTML(data) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; padding: 30px; color: #333; }
        h1 { color: #2c3e50; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
        .footer { margin-top: 40px; font-size: 0.9em; color: #666; }
      </style>
    </head>
    <body>
      <h1>Invoice</h1>
      <p><strong>Customer:</strong> ${data.customerName || "N/A"}</p>
      <p><strong>Date:</strong> ${data.date || "N/A"}</p>
      <table>
        <thead>
          <tr><th>Item</th><th>Qty</th><th>Price</th></tr>
        </thead>
        <tbody>
          ${Array.isArray(data.items) ? data.items.map(
            item => `<tr><td>${item.name}</td><td>${item.quantity}</td><td>$${item.price}</td></tr>`
          ).join("") : ""}
        </tbody>
      </table>
      <p><strong>Total:</strong> $${data.total || "0"}</p>
      <p class="footer">Thanks for using our service!</p>
    </body>
    </html>
  `;
}

// Recipe HTML generator
function generateRecipeHTML(data) {
  return `
    <!DOCTYPE html>
    <html>
    <body>
      <h1>${data.title || "Recipe"}</h1>
      <p>${data.description || ""}</p>
      <h3>Ingredients:</h3>
      <pre>${data.ingredients || ""}</pre>
      <h3>Instructions:</h3>
      <pre>${data.instructions || ""}</pre>
    </body>
    </html>
  `;
}

// Therapy Report HTML generator (simplified)
function generateTherapyReportHTML(data) {
  return `<html><body><h1>Therapy Report for ${data.patient || "N/A"}</h1></body></html>`;
}

// Shop Order HTML generator (simplified)
function generateShopOrderHTML(data) {
  return `<html><body><h1>Order #${data.orderId || "N/A"}</h1></body></html>`;
}

// Packing Slip HTML generator (simplified)
function generatePackingSlipHTML(data) {
  return `<html><body><h1>Packing Slip</h1><p>${data.contents || ""}</p></body></html>`;
}
