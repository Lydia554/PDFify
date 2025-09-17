const axios = require("axios");

/**
 * Convert image URL to Base64 string
 * @param {string} url 
 * @returns {Promise<string>}
 */
async function getBase64Image(url) {
  try {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    return `data:image/png;base64,${Buffer.from(response.data, "binary").toString("base64")}`;
  } catch (err) {
    console.error("❌ Error fetching image for PDF:", url, err);
    return ""; 
  }
}

async function generateInvoiceHTML(data) {
  const locale = data.locale || {};
  const items = Array.isArray(data.items) ? data.items : [];

  const logoUrl =
    typeof data.customLogoUrl === "string" && data.customLogoUrl.trim().length > 0
      ? data.customLogoUrl.trim()
      : "https://pdfify.pro/images/Logo.png";

  const userClass = "pdfa-clean"; // always PDF/A-compliant

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
            Number(String(data.subtotal).replace(/[^\d.-]/g, "")) || 0,
            Number(String(data.tax).replace(/[^\d.-]/g, "")) || 0,
          ],
        },
      ],
    },
  };

  const chartConfigEncoded = encodeURIComponent(JSON.stringify(chartConfig));

  const logoBase64 = await getBase64Image(logoUrl);
  const chartBase64 = data.showChart
    ? await getBase64Image(`https://quickchart.io/chart?c=${chartConfigEncoded}`)
    : "";

  return `
<html>
  <head>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap');

  body {
    font-family: 'Open Sans', sans-serif;
    color: #2a3d66;
    background: #f4f7fb;
    margin: 0;
    padding: 0;
  }

  .container {
    max-width: 800px;
    margin: 20px auto;
    padding: 30px 40px 60px;
    background: linear-gradient(to bottom right, #ffffff, #f0f4ff);
    border-radius: 16px;
    border: 1px solid #c5d0f9;
    box-shadow: 0 6px 15px rgba(42,61,102,0.15);
  }

  .table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 20px;
  }

  .table th, .table td {
    padding: 12px;
    text-align: left;
    border: 1px solid #c5d0f9;
  }

  .table th {
    background-color: #dbe7ff;
    color: #2a3d66;
    font-weight: 600;
  }

  .table td {
    background-color: #fdfdff;
    color: #2a3d66;
  }

  .table tr:nth-child(even) td {
    background-color: #f6f9fe;
  }

  .table tfoot td {
    background-color: #dbe7ff;
    font-weight: bold;
    color: #2a3d66;
  }

  .total p {
    font-weight: bold;
    color: #2a3d66;
    font-size: 1.1em;
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
    text-align: center;
    font-size: 11px;
    margin-top: 20px;
    color: #2a3d66;
    background: #e8f0ff;
    padding: 10px;
    border-top: 1px solid #c5d0f9;
  }

  .footer a {
    color: #1b2a90;
    text-decoration: none;
  }

  .footer a:hover {
    text-decoration: underline;
  }
</style>
  </head>
<body class="${userClass}">
  <div class="container">
    ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" style="height:60px;" />` : ""}
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

  ${watermarkHTML}

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

module.exports.generateInvoiceHTML = generateInvoiceHTML;
