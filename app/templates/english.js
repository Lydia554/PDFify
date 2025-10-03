/**
 * Generate fully self-contained HTML invoice for PDF rendering
 * @param {Object} data
 * @returns {string}
 */
async function generateInvoiceHTML(data) {
  const locale = data.locale || {};
  const items = Array.isArray(data.items) ? data.items : [];

  // Use base64 embedded logo instead of external URL
  const logoBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAA..."; // replace with your real base64 logo

  // Chart config (QuickChart) only if showChart is true
  const chartBase64 = data.showChart && data.subtotal && data.tax
    ? `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify({
        type: "pie",
        data: {
          labels: ["Subtotal", "Tax"],
          datasets: [{ data: [Number(String(data.subtotal).replace(/[^\d.-]/g, "")) || 0,
                             Number(String(data.tax).replace(/[^\d.-]/g, "")) || 0] }]
        }
      }))}`
    : "";

  // Watermark for preview/basic users
  const watermarkHTML = (data.isBasicUser || data.isPreview)
    ? `<div class="watermark">${locale.watermarkBasic || 'FOR PRODUCTION ONLY — NOT AVAILABLE IN BASIC VERSION'}</div>`
    : "";

  return `
<html>
<head>
<style>
  body { font-family: Arial, sans-serif; margin:0; padding:0; background:#f4f7fb; color:#2a3d66; }
  .container { max-width:800px; margin:20px auto; padding:30px 40px 60px; background:linear-gradient(to bottom right, #ffffff, #f0f4ff); border-radius:16px; border:1px solid #c5d0f9; box-shadow:0 6px 15px rgba(42,61,102,0.15); position:relative; }
  h1 { text-align:center; margin-bottom:20px; }
  .invoice-header { display:flex; justify-content:space-between; margin-bottom:20px; }
  .invoice-header p { margin:4px 0; }
  .table { width:100%; border-collapse: collapse; margin-bottom:20px; }
  .table th, .table td { border:1px solid #c5d0f9; padding:12px; text-align:left; }
  .table th { background-color:#dbe7ff; font-weight:600; }
  .table td { background-color:#fdfdff; }
  .table tr:nth-child(even) td { background-color:#f6f9fe; }
  .table tfoot td { background-color:#dbe7ff; font-weight:bold; }
  .total p { font-weight:bold; font-size:1.1em; margin:10px 0; }
  .chart-container { text-align:center; margin-top:20px; }
  .watermark { position:fixed; top:40%; left:50%; transform:translate(-50%,-50%) rotate(-45deg); font-size:60px; color:#ffcccc; font-weight:900; pointer-events:none; user-select:none; z-index:9999; white-space:nowrap; }
  .footer { max-width:800px; margin:40px auto 10px auto; padding:10px; line-height:1.6; font-size:11px; background:#e8f0ff; border-top:1px solid #c5d0f9; text-align:center; border-radius:0 0 16px 16px; color:#2a3d66; }
  .footer a { color:#2a3d66; text-decoration:none; }
  .footer a:hover { text-decoration:underline; }
</style>
</head>
<body>
  <div class="container">
    <img src="${logoBase64}" alt="Logo" style="height:60px; display:block; margin:auto;" />
    <h1>${locale.invoiceTitle || "Invoice"} — ${data.customerName || "Customer"}</h1>

    <div class="invoice-header">
      <div class="left">
        <p><strong>${locale.orderId || "Order ID"}:</strong> ${data.orderId || ""}</p>
        <p><strong>${locale.date || "Date"}:</strong> ${data.date || ""}</p>
      </div>
      <div class="right">
        <p><strong>${locale.customer || "Customer"}:</strong><br>${data.customerName || ""}</p>
        <p><strong>${locale.email || "Email"}:</strong><br><a href="mailto:${data.customerEmail || ""}">${data.customerEmail || ""}</a></p>
      </div>
    </div>

    <table class="table">
      <thead>
        <tr>
          <th>${locale.item || "Item"}</th>
          <th>${locale.quantity || "Quantity"}</th>
          <th>${locale.price || "Price"}</th>
          <th>${locale.net || "Net"}</th>
          <th>${locale.tax || "Tax"}</th>
          <th>${locale.total || "Total"}</th>
        </tr>
      </thead>
      <tbody>
        ${
          items.length
            ? items.map(item => `
              <tr>
                <td>${item.name || ""}</td>
                <td>${item.quantity || ""}</td>
                <td>${item.price || ""}</td>
                <td>${item.net || "-"}</td>
                <td>${item.tax || "-"}</td>
                <td>${item.total || ""}</td>
              </tr>`).join("")
            : `<tr><td colspan="6">${locale.noItemsAvailable || "No items available"}</td></tr>`
        }
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5">${locale.subtotal || "Subtotal"}</td>
          <td>${data.subtotal || ""}</td>
        </tr>
        <tr>
          <td colspan="5">${locale.tax || "Tax"} (${data.taxRate || "21%"})</td>
          <td>${data.tax || ""}</td>
        </tr>
        <tr>
          <td colspan="5">${locale.total || "Total"}</td>
          <td>${data.total || ""}</td>
        </tr>
      </tfoot>
    </table>

    <div class="total">
      <p>${locale.totalAmountDue || "Total Amount Due"}: ${data.total || ""}</p>
    </div>

    ${chartBase64 ? `<div class="chart-container"><img src="${chartBase64}" alt="Invoice Breakdown" style="max-width:500px;"></div>` : ""}
  </div>

  ${watermarkHTML}

  <div class="footer">
    <p>${locale.thanks || "Thanks for using our service!"}</p>
    <p>${locale.contact || "Contact us at"} <a href="mailto:pdfifyapi@gmail.com">pdfifyapi@gmail.com</a></p>
    <p>&copy; 2025 🧾PDFify — ${locale.copyright || "All rights reserved."}</p>
    <p>${locale.generated || "Generated using"} <strong>PDFify</strong>. ${locale.visitSite || '<a href="https://pdfify.pro/" target="_blank">Visit our site for more.</a>'}</p>
  </div>
</body>
</html>
  `;
}

module.exports = { generateInvoiceHTML };
