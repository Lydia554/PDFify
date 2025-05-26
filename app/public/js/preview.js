// preview.js

// Render preview from JSON string and endpoint
function renderPreview(jsonStrOverride = null, endpointOverride = null) {
  const endpointSelect = document.getElementById("endpoint") || document.getElementById("friendly-endpoint-select");
  const endpoint = endpointOverride || (endpointSelect && endpointSelect.value ? `generate-${endpointSelect.value}` : null);

  const jsonInput = document.getElementById("json");
  const jsonStr = jsonStrOverride || (jsonInput ? jsonInput.value : null);
  const previewFrame = document.getElementById("previewFrame");

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

  const doc = previewFrame.contentDocument || previewFrame.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
}

// Sample invoice HTML generator
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
            (item) =>
              `<tr><td>${item.name}</td><td>${item.quantity}</td><td>$${item.price}</td></tr>`
          ).join("") : ""}
        </tbody>
      </table>
      <p class="footer">Thanks for using our service!</p>
    </body>
    </html>
  `;
}

function generateRecipeHTML(data) {
  return `<html><body><h1>${data.title || "Recipe"}</h1><p>${data.description || ""}</p></body></html>`;
}

function generateTherapyReportHTML(data) {
  return `<html><body><h1>Therapy Report for ${data.patient || "N/A"}</h1></body></html>`;
}

function generateShopOrderHTML(data) {
  return `<html><body><h1>Order #${data.orderId || "N/A"}</h1></body></html>`;
}

function generatePackingSlipHTML(data) {
  return `<html><body><h1>Packing Slip</h1><p>${data.contents || ""}</p></body></html>`;
}


// Friendly Mode form generation & preview

const formContainer = document.getElementById('formContainer');
const friendlyEndpointSelect = document.getElementById('friendly-endpoint-select');

function generateInvoiceForm() {
  formContainer.innerHTML = `
    <label>Customer Name:<input id="invoice-customerName" type="text"></label><br>
    <label>Customer Email:<input id="invoice-customerEmail" type="email"></label><br>
    <label>Order ID:<input id="invoice-orderId" type="text"></label><br>
    <label>Date:<input id="invoice-date" type="date"></label><br>
    <label>Item 1 Name:<input id="invoice-item1-name" type="text"></label><br>
    <label>Item 1 Quantity:<input id="invoice-item1-qty" type="number" min="1" value="1"></label><br>
    <label>Item 1 Price:<input id="invoice-item1-price" type="text"></label><br>
    <label>Subtotal:<input id="invoice-subtotal" type="text"></label><br>
    <label>Tax:<input id="invoice-tax" type="text"></label><br>
    <label>Total:<input id="invoice-total" type="text"></label><br>
    <label>Logo URL:<input id="invoice-logo" type="text"></label><br>
    <label>Show Chart:<input id="invoice-showChart" type="checkbox"></label><br>
  `;
}

function generateRecipeForm() {
  formContainer.innerHTML = `
    <label>Title:<input id="recipe-title" type="text"></label><br>
    <label>Description:<textarea id="recipe-description"></textarea></label><br>
  `;
}

function generateFormForTemplate(template) {
  switch(template) {
    case 'invoice':
      generateInvoiceForm();
      break;
    case 'recipe':
      generateRecipeForm();
      break;
    default:
      formContainer.innerHTML = '<p>No form available for this template.</p>';
  }
}

// Initialize form for default Friendly Mode template
if (friendlyEndpointSelect) {
  generateFormForTemplate(friendlyEndpointSelect.value);
  friendlyEndpointSelect.addEventListener('change', () => {
    generateFormForTemplate(friendlyEndpointSelect.value);
  });
}

function previewFriendly() {
  const endpoint = friendlyEndpointSelect.value;

  let data = {};

  if (endpoint === "invoice") {
    data = {
      customerName: document.getElementById("invoice-customerName").value,
      customerEmail: document.getElementById("invoice-customerEmail").value,
      orderId: document.getElementById("invoice-orderId").value,
      date: document.getElementById("invoice-date").value,
      items: [
        {
          name: document.getElementById("invoice-item1-name").value,
          quantity: parseInt(document.getElementById("invoice-item1-qty").value) || 0,
          price: document.getElementById("invoice-item1-price").value,
        },
      ],
      subtotal: document.getElementById("invoice-subtotal").value,
      tax: document.getElementById("invoice-tax").value,
      total: document.getElementById("invoice-total").value,
      customLogoUrl: document.getElementById("invoice-logo").value,
      showChart: document.getElementById("invoice-showChart").checked,
      isPremium: true
    };
  } else if (endpoint === "recipe") {
    data = {
      title: document.getElementById("recipe-title").value,
      description: document.getElementById("recipe-description").value,
    };
  } else {
    alert("No friendly form available for this template.");
    return;
  }

  const jsonString = JSON.stringify({ data });
  renderPreview(jsonString, `generate-${endpoint}`);
}

// Button event listeners for preview buttons
document.addEventListener('DOMContentLoaded', () => {
  const previewDevBtn = document.getElementById('previewDevBtn');
  if (previewDevBtn) {
    previewDevBtn.addEventListener('click', () => renderPreview());
  }

  const previewFriendlyBtn = document.getElementById('previewFriendlyBtn');
  if (previewFriendlyBtn) {
    previewFriendlyBtn.addEventListener('click', () => previewFriendly());
  }
});


// Expose functions globally if needed
window.renderPreview = renderPreview;
window.previewFriendly = previewFriendly;
