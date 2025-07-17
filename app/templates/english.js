const defaultTranslations = {
  invoiceTitle: "Invoice for",
  orderId: "Order ID",
  date: "Date",
  customer: "Customer",
  email: "Email",
  item: "Item",
  quantity: "Quantity",
  price: "Price",
  net: "Net",
  tax: "Tax",
  total: "Total",
  subtotal: "Subtotal",
  taxLabel: "Tax",
  totalAmountDue: "Total Amount Due",
  breakdown: "Breakdown",
  thanks: "Thanks for using our service!",
  contact: "If you have questions, contact us at",
  copyright: "All rights reserved.",
  generated: "Generated using",
  visitSite: "Visit our site for more."
};

function generateInvoiceHTML(data, locale = {}) {
  const t = (key) => locale[key] || defaultTranslations[key] || key;

  const items = Array.isArray(data.items) ? data.items : [];

  const logoUrl =
    typeof data.customLogoUrl === "string" && data.customLogoUrl.trim().length > 0
      ? data.customLogoUrl.trim()
      : "https://pdfify.pro/images/Logo.png";

  const userClass = data.isBasicUser ? "basic" : "premium";

  const watermarkHTML =
    data.isBasicUser && data.isPreview
      ? `<div class="watermark">FOR PRODUCTION ONLY — NOT AVAILABLE IN BASIC VERSION</div>`
      : "";

  // Prepare chart config data safely parsing amounts
  const subtotalNumber = Number(String(data.subtotal).replace(/[^\d.-]/g, '')) || 0;
  const taxNumber = Number(String(data.tax).replace(/[^\d.-]/g, '')) || 0;

  const chartConfig = {
    type: "pie",
    data: {
      labels: [t("subtotal"), t("taxLabel")],
      datasets: [
        {
          data: [subtotalNumber, taxNumber],
          backgroundColor: ["#f39c12", "#2980b9"]
        }
      ]
    },
    options: {
      plugins: {
        legend: { position: 'bottom' }
      }
    }
  };

  const chartConfigEncoded = encodeURIComponent(JSON.stringify(chartConfig));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${t("invoiceTitle")} ${data.customerName || ""}</title>
  <style>
    /* Reset */
    * {
      margin: 0; padding: 0; box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
        Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
      color: #333;
    }
    body {
      background: #fff;
      padding: 20px;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      border: 1px solid #ddd;
      padding: 20px;
      position: relative;
      background: white;
    }
    h1 {
      font-weight: 500;
      font-size: 1.8rem;
      margin-bottom: 15px;
      color: #222;
    }
    .invoice-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    .invoice-header .left p,
    .invoice-header .right p {
      margin-bottom: 6px;
      font-size: 0.95rem;
    }
    .invoice-header .right {
      text-align: right;
    }
    .invoice-header strong {
      color: #555;
    }
    table.table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
      font-size: 0.9rem;
    }
    table.table thead tr {
      background: #f7f7f7;
      border-bottom: 2px solid #ddd;
    }
    table.table th,
    table.table td {
      padding: 10px 8px;
      text-align: left;
      border: 1px solid #ddd;
    }
    table.table tfoot td {
      font-weight: 600;
      font-size: 1rem;
      background: #f4f4f4;
    }
    .total {
      text-align: right;
      font-size: 1.2rem;
      font-weight: 600;
      margin-bottom: 30px;
    }
    .chart-container {
      width: 300px;
      margin: 0 auto 40px;
      text-align: center;
    }
    .chart-container h2 {
      margin-bottom: 15px;
      color: #444;
      font-weight: 600;
    }
    .footer {
      font-size: 0.85rem;
      text-align: center;
      color: #999;
      border-top: 1px solid #eee;
      padding-top: 15px;
      margin-top: 40px;
    }
    .footer a {
      color: #2980b9;
      text-decoration: none;
    }
    .watermark {
      position: fixed;
      top: 40%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-35deg);
      font-size: 2rem;
      color: rgba(255, 0, 0, 0.15);
      pointer-events: none;
      user-select: none;
      font-weight: 900;
      letter-spacing: 2px;
      z-index: 9999;
      white-space: nowrap;
    }
    body.basic .container {
      border-color: #f39c12;
    }
  </style>
</head>
<body class="${userClass}">
  <div class="container">
    <img src="${logoUrl}" alt="Logo" style="height: 60px; margin-bottom: 20px;" />
    <h1>${t("invoiceTitle")} ${data.customerName || ""}</h1>
    <div class="invoice-header">
      <div class="left">
        <p><strong>${t("orderId")}:</strong> ${data.orderId || "-"}</p>
        <p><strong>${t("date")}:</strong> ${data.date || "-"}</p>
      </div>
      <div class="right">
        <p><strong>${t("customer")}:</strong><br/>${data.customerName || "-"}</p>
        <p><strong>${t("email")}:</strong><br/><a href="mailto:${data.customerEmail || ''}">${data.customerEmail || '-'}</a></p>
      </div>
    </div>

    <table class="table">
      <thead>
        <tr>
          <th>${t("item")}</th>
          <th>${t("quantity")}</th>
          <th>${t("price")}</th>
          <th>${t("net")}</th>
          <th>${t("tax")}</th>
          <th>${t("total")}</th>
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
            : `<tr><td colspan="6">No items available</td></tr>`
        }
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5">${t("subtotal")}</td>
          <td>${data.subtotal || "-"}</td>
        </tr>
        <tr>
          <td colspan="5">${t("taxLabel")} (${data.taxRate || "21%"})</td>
          <td>${data.tax || "-"}</td>
        </tr>
        <tr>
          <td colspan="5">${t("total")}</td>
          <td>${data.total || "-"}</td>
        </tr>
      </tfoot>
    </table>

    <div class="total">${t("totalAmountDue")}: ${data.total || "-"}</div>

    ${
      data.showChart
        ? `<div class="chart-container">
      <h2>${t("breakdown")}</h2>
      <img src="https://quickchart.io/chart?c=${chartConfigEncoded}" alt="Invoice Breakdown Chart" />
    </div>`
        : ""
    }
  </div>

  ${watermarkHTML}

  <div class="footer">
    <p>${t("thanks")}</p>
    <p>${t("contact")} <a href="mailto:pdfifyapi@gmail.com">pdfifyapi@gmail.com</a>.</p>
    <p>&copy; 2025 🧾PDFify — ${t("copyright")}</p>
    <p>${t("generated")} <strong>PDFify</strong>. <a href="https://pdfify.pro/" target="_blank" rel="noopener">${t("visitSite")}</a></p>
  </div>
</body>
</html>`;
}

module.exports = { generateInvoiceHTML };
