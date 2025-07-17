function generateInvoiceHTML(data, locale = {}) {
  const t = (key) => locale[key] || key; 

  const items = Array.isArray(data.items) ? data.items : [];
  const logoUrl = typeof data.customLogoUrl === "string" && data.customLogoUrl.trim().length > 0
    ? data.customLogoUrl.trim()
    : "https://pdfify.pro/images/Logo.png";

  const userClass = data.isBasicUser ? "basic" : "premium";

  const watermarkHTML =
    data.isBasicUser && data.isPreview
      ? `<div class="watermark">FOR PRODUCTION ONLY — NOT AVAILABLE IN BASIC VERSION</div>`
      : "";

  const chartConfig = {
    type: "pie",
    data: {
      labels: [t("subtotal"), t("taxLabel")],
      datasets: [
        {
          data: [
            Number(String(data.subtotal).replace(/[^\d.-]/g, '')) || 0,
            Number(String(data.tax).replace(/[^\d.-]/g, '')) || 0
          ]
        }
      ]
    }
  };

  const chartConfigEncoded = encodeURIComponent(JSON.stringify(chartConfig));

  return `<!DOCTYPE html>
<html>
<head>
  <!-- [your styles as-is] -->
</head>
<body class="${userClass}">
  <div class="container">
    <img src="${logoUrl}" alt="Logo" style="height: 60px;" />
    <h1>${t("invoiceTitle")} ${data.customerName}</h1>
    <div class="invoice-header">
      <div class="left">
        <p><strong>${t("orderId")}:</strong> ${data.orderId}</p>
        <p><strong>${t("date")}:</strong> ${data.date}</p>
      </div>
      <div class="right">
        <p><strong>${t("customer")}:</strong><br>${data.customerName}</p>
        <p><strong>${t("email")}:</strong><br><a href="mailto:${data.customerEmail}">${data.customerEmail}</a></p>
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
            ? items.map(item => `
              <tr>
                <td>${item.name || ""}</td>
                <td>${item.quantity || ""}</td>
                <td>${item.price || ""}</td>
                <td>${item.net || "-"}</td>
                <td>${item.tax || "-"}</td>
                <td>${item.total || ""}</td>
              </tr>
            `).join("")
            : `<tr><td colspan="6">No items available</td></tr>`
        }
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5">${t("subtotal")}</td>
          <td>${data.subtotal}</td>
        </tr>
        <tr>
          <td colspan="5">${t("taxLabel")} (${data.taxRate || "21%"})</td>
          <td>${data.tax}</td>
        </tr>
        <tr>
          <td colspan="5">${t("total")}</td>
          <td>${data.total}</td>
        </tr>
      </tfoot>
    </table>

    <div class="total">
      <p>${t("totalAmountDue")}: ${data.total}</p>
    </div>

    ${
      data.showChart
        ? `<div class="chart-container">
            <h2>${t("breakdown")}</h2>
            <img src="https://quickchart.io/chart?c=${chartConfigEncoded}" alt="Invoice Breakdown" />
          </div>`
        : ""
    }
  </div>

  ${watermarkHTML}

  <div class="footer">
    <p>${t("thanks")}</p>
    <p>${t("contact")} <a href="mailto:pdfifyapi@gmail.com">pdfifyapi@gmail.com</a>.</p>
    <p>&copy; 2025 🧾PDFify — ${t("copyright")}</p>
    <p>${t("generated")} <strong>PDFify</strong>. <a href="https://pdfify.pro/" target="_blank">${t("visitSite")}</a></p>
  </div>
</body>
</html>`;
}

module.exports.generateInvoiceHTML = generateInvoiceHTML;
