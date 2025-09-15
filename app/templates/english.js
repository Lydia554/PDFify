function generateInvoiceHTML(data) {
  const locale = data.locale || {};
  const items = Array.isArray(data.items) ? data.items : [];
  const logoUrl =
    typeof data.customLogoUrl === "string" && data.customLogoUrl.trim().length > 0
      ? data.customLogoUrl.trim()
      : "https://pdfify.pro/images/Logo.png";

  // Always PDF/A-clean class for strict compliance
  const userClass = "pdfa-clean";

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
      body {
        font-family: 'Open Sans', sans-serif;
        color: #000;
        background: #ffffff;
        margin: 0;
        padding: 0;
      }

      .container {
        max-width: 800px;
        margin: 20px auto;
        padding: 30px 40px 40px;
        background: #ffffff;
        border: 1px solid #ccc;
      }

      .table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 20px;
      }

      .table th,
      .table td {
        padding: 12px;
        border: 1px solid #ccc;
        text-align: left;
        color: #000;
        background-color: #fff;
      }

      .table th {
        font-weight: 600;
        background-color: #e6e6e6;
      }

      .table tfoot td {
        font-weight: bold;
      }

      .watermark {
        display: none !important;
      }

      .footer {
        text-align: center;
        font-size: 11px;
        margin-top: 20px;
        color: #000;
        background: #eaeaea;
        padding: 10px;
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
            items.length > 0
              ? items.map(
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
                ).join("")
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
      <p>&copy; 2025 PDFify — ${locale.copyright || "All rights reserved."}</p>
      <p>${locale.generated || "Generated using"} <strong>PDFify</strong>. ${locale.visitSite || '<a href="https://pdfify.pro/" target="_blank">Visit our site for more.</a>'}</p>
    </div>
  </body>
</html>
  `;
}

module.exports.generateInvoiceHTML = generateInvoiceHTML;
