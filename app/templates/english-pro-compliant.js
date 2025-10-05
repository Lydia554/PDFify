const path = require("path");

/**
 * Generate HTML invoice for Pro compliant users
 * @param {Object} data
 * @returns {string}
 */
async function generateInvoiceHTMLPro(data) {
  const locale = data.locale || {};
  const items = Array.isArray(data.items) ? data.items : [];

  // Use user-provided logo or default
  const logoUrl = data.customLogoUrl || "https://pdfify.pro/images/Logo.png";

  // Chart config
  const chartConfig = {
    type: "pie",
    data: {
      labels: ["Subtotal", "Tax"],
      datasets: [
        {
          data: [
            Number(String(data.subtotal).replace(/[^\d.-]/g, "")) || 0,
            Number(String(data.tax).replace(/[^\d.-]/g, "")) || 0,
          ],
        },
      ],
    },
  };
  const chartConfigEncoded = encodeURIComponent(JSON.stringify(chartConfig));
  const chartBase64 = data.showChart
    ? `https://quickchart.io/chart?c=${chartConfigEncoded}`
    : "";

  // Fonts folder (embedded for PDF/A)
  const fontPath = path.join(__dirname, "fonts");

  return `
<html>
<head>
  <style>
    @font-face {
      font-family: 'OpenSans';
      src: url('file://${fontPath}/OpenSans-Regular.ttf') format('truetype');
      font-weight: 400;
    }
    @font-face {
      font-family: 'OpenSans';
      src: url('file://${fontPath}/OpenSans-Bold.ttf') format('truetype');
      font-weight: 700;
    }

    body {
      font-family: 'OpenSans', sans-serif;
      color: #000;
      background: #fff;
      margin: 0;
      padding: 0;
      min-height: 100vh;
    }

    .container {
      max-width: 800px;
      margin: 20px auto;
      padding: 30px 40px 60px;
      background: #fff;
      border-radius: 16px;
      border: 1px solid #c5d0f9;
      box-shadow: 0 6px 15px rgba(42,61,102,0.15);
      position: relative;
    }

    .table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }

    .table th, .table td {
      padding: 12px;
      border: 1px solid #c5d0f9;
      text-align: left;
    }

    .table th {
      background-color: #dbe7ff;
      font-weight: 700;
    }

    .table td {
      background-color: #fdfdff;
    }

    .table tr:nth-child(even) td {
      background-color: #f6f9fe;
    }

    .table tfoot td {
      background-color: #dbe7ff;
      font-weight: 700;
    }

    .total p {
      font-weight: bold;
      font-size: 1.1em;
    }

    .footer {
      max-width: 800px;
      margin: 40px auto 10px auto;
      padding: 10px;
      font-size: 11px;
      border-top: 1px solid #c5d0f9;
      text-align: center;
    }

    .footer a {
      text-decoration: none;
      color: #000;
    }
  </style>
</head>
<body>
  <div class="container">
    <img src="${logoUrl}" alt="Logo" style="height:60px;" />
    <h1>${locale.invoiceTitle || "Invoice for"} ${data.customerName || "Customer"}</h1>

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

    ${
      chartBase64
        ? `<div class="chart-container">
            <h2>${locale.breakdown || "Breakdown"}</h2>
            <img src="${chartBase64}" alt="${locale.invoiceBreakdown || "Invoice Breakdown"}" style="max-width:500px;display:block;margin:auto;" />
          </div>`
        : ""
    }
  </div>

  <div class="footer">
    <p>${locale.thanks || "Thanks for using our service!"}</p>
    <p>${locale.contact || "If you have questions, contact us at"} <a href="mailto:pdfifyapi@gmail.com">pdfifyapi@gmail.com</a>.</p>
    <p>&copy; 2025 🧾PDFify — ${locale.copyright || "All rights reserved."}</p>
    <p>${locale.generated || "Generated using"} <strong>PDFify</strong>. ${locale.visitSite || '<a href="https://pdfify.pro/" target="_blank">Visit our site for more.</a>'}</p>
  </div>
</body>
</html>
  `;
}

module.exports = { generateInvoiceHTMLPro };
