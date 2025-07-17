function generateInvoiceHTML(data) {
  const locale = data.locale || {};

  const items = Array.isArray(data.items) ? data.items : [];

  const logoUrl =
    typeof data.customLogoUrl === "string" && data.customLogoUrl.trim().length > 0
      ? data.customLogoUrl.trim()
      : "https://pdfify.pro/images/Logo.png";

  const userClass = data.isBasicUser ? "basic" : "premium";

  const watermarkHTML =
    data.isBasicUser && data.isPreview
      ? `<div class="watermark">${locale.watermarkBasic || 'FOR PRODUCTION ONLY — NOT AVAILABLE IN BASIC VERSION'}</div>`
      : "";

  const chartConfig = {
    type: "pie",
    data: {
      labels: ["Subtotal", "Tax"],
      datasets: [
        {
          data: [
  Number(String(data.subtotal).replace(/[^\d.-]/g, '')) || 0,
Number(String(data.tax).replace(/[^\d.-]/g, '')) || 0,

          ],
        },
      ],
    },
  };

  const chartConfigEncoded = encodeURIComponent(JSON.stringify(chartConfig));

  return `
<html>
  <head>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&display=swap');

  body {
    font-family: 'Open Sans', sans-serif;
    color: #333;
    background: #f4f7fb;
    margin: 0;
    padding: 0;
    min-height: 100vh;
    position: relative;
  }

  .container {
    max-width: 800px;
    margin: 20px auto;
    padding: 30px 40px 160px;
    background: linear-gradient(to bottom right, #ffffff, #f8fbff);
    box-shadow: 0 8px 25px #2a3d66;
    border-radius: 16px;
    border: 1px solid #e0e4ec;
    position: relative;
    z-index: 1;
  }

  .premium .table,
  .basic .table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 20px;
  }

  .premium .table th,
  .premium .table td {
    padding: 14px;
    border: 1px solid #dee2ef;
    text-align: left;
  }

  .premium .table th {
    background-color: #dbe7ff;
    color: #2a3d66;
    font-weight: 600;
  }

  .premium .table td {
    color: #444;
    background-color: #fdfdff;
  }

  .premium .table tr:nth-child(even) td {
    background-color: #f6f9fe;
  }

  .premium .table tfoot td {
    background-color: #dbe7ff;
    font-weight: bold;
    color: #2a3d66;
  }

  .premium .total p {
    font-weight: bold;
    color: #2a3d66;
  }

  .basic .table th,
  .basic .table td {
    padding: 14px;
    border: 1px solid #ccc;
    text-align: left;
  }

  .basic .table th {
    background-color: #fff;
    color: #333;
    font-weight: 600;
  }

  .basic .table td {
    color: #444;
    background-color: #fff;
  }

  .basic .table tr:nth-child(even) td {
    background-color: #f9f9f9;
  }

  .basic .table tfoot td {
    background-color: #fff;
    font-weight: bold;
  }

  .basic .total p {
    font-weight: normal;
    color: #333;
  }

  .watermark {
    position: fixed;
    top: 40%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-45deg);
    font-size: 60px;
    color: #ffcccc;
    font-weight: 900;
    pointer-events: none;
    user-select: none;
    z-index: 9999;
    white-space: nowrap;
  }

  .footer {
    position: static;
    max-width: 800px;
    margin: 40px auto 10px auto;
    padding: 10px 20px;
    background-color: #f0f2f7;
    color: #555;
    border-top: 2px solid #cbd2e1;
    text-align: center;
    line-height: 1.6;
    font-size: 11px;
    border-radius: 0 0 16px 16px;
    box-sizing: border-box;
  }

  .footer p {
    margin: 6px 0;
  }

  .footer a {
    color: #4a69bd;
    text-decoration: none;
    word-break: break-word;
  }

  .footer a:hover {
    text-decoration: underline;
  }

  /* ========================== */
  /* PDF/A-3b compliant override */
  /* ========================== */
 .pdfa-clean .container {
    background-color: #ffffff !important;
    box-shadow: none !important;
    border: 1px solid #ccc !important;
  }
  .pdfa-clean .premium .table th {
    background-color: #e6e6e6 !important;
    color: #000 !important;
  }
  .pdfa-clean .premium .table td {
    background-color: #ffffff !important;
    color: #000 !important;
  }
  .pdfa-clean .premium .table tr:nth-child(even) td {
    background-color: #f2f2f2 !important;
  }
  .pdfa-clean .footer {
    background-color: #eaeaea !important;
    color: #000 !important;
    border-top: 1px solid #bbb !important;
  }
  .pdfa-clean .watermark {
    display: none !important;
  }
</style>

  </head>
<body class="${userClass}">
  <div class="container">
    <img src="${logoUrl}" alt="Logo" style="height: 60px;" />

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

    <table>
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
          items.length > 0
            ? items
                .map(
                  (item) => `
          <tr>
            <td>${item.name || ""}</td>
            <td>${item.quantity || ""}</td>
            <td>${item.price || ""}</td>
            <td>${item.net || "-"}</td>
            <td>${item.tax || "-"}</td>
            <td>${item.total || ""}</td>
          </tr>
          `
                )
                .join("")
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
      data.showChart
        ? `
      <div class="chart-container">
        <h2>${locale.breakdown || "Breakdown"}</h2>
        <img src="https://quickchart.io/chart?c=${chartConfigEncoded}" alt="${locale.invoiceBreakdown || "Invoice Breakdown"}" style="max-width:500px;display:block;margin:auto;" />
      </div>
      `
        : ""
    }
  </div>

  ${watermarkHTML}

  <div class="footer">
    <p>${locale.thanks || "Thanks for using our service!"}</p>
    <p>${locale.contact || "If you have questions, contact us at"} <a href="mailto:pdfifyapi@gmail.com">pdfifyapi@gmail.com</a>.</p>
    <p>&copy; 2025 🧾PDFify — ${locale.copyright || "All rights reserved."}</p>
    <p>
      ${locale.generated || "Generated using"} <strong>PDFify</strong>. ${locale.visitSite || '<a href="https://pdfify.pro/" target="_blank">Visit our site for more.</a>'}
    </p>
  </div>
</body>
</html>

  `;
}

module.exports.generateInvoiceHTML = generateInvoiceHTML;