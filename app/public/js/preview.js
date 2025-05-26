function renderPreview(jsonStrOverride = null, endpointOverride = null) {
  const endpoint = endpointOverride || document.getElementById("endpointSelect").value;
  const jsonStr = jsonStrOverride || document.getElementById("json").value;
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


// 🧾 Sample Invoice HTML generator
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
          ${data.items
            .map(
              (item) =>
                `<tr><td>${item.name}</td><td>${item.quantity}</td><td>$${item.price}</td></tr>`
            )
            .join("")}
        </tbody>
      </table>
      <p class="footer">Thanks for using our service!</p>
    </body>
    </html>
  `;
}

// Add placeholders for other generators
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


function previewFriendly() {
  const endpoint = document.getElementById("friendly-endpoint-select").value;

  let data = {};

  if (endpoint === "generate-invoice") {
    data = {
      customerName: document.getElementById("invoice-customerName").value,
      customerEmail: document.getElementById("invoice-customerEmail").value,
      orderId: document.getElementById("invoice-orderId").value,
      date: document.getElementById("invoice-date").value,
      items: [
        {
          name: document.getElementById("invoice-item1-name").value,
          quantity: parseInt(document.getElementById("invoice-item1-qty").value),
          price: document.getElementById("invoice-item1-price").value,
          total: document.getElementById("invoice-item1-total").value,
        },
        // Add more items if needed
      ],
      subtotal: document.getElementById("invoice-subtotal").value,
      tax: document.getElementById("invoice-tax").value,
      total: document.getElementById("invoice-total").value,
      customLogoUrl: document.getElementById("invoice-logo").value,
      showChart: document.getElementById("invoice-showChart").checked,
      isPremium: true
    };
  }

  // ... repeat for other endpoints like recipe, therapy report, etc.

  const jsonString = JSON.stringify({ data });
  renderPreview(jsonString, endpoint); // ✅ You already have this in `preview.js`
}
