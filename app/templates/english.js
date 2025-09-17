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
            Number(String(data.subtotal).replace(/[^\d.-]/g, "")) || 0,
            Number(String(data.tax).replace(/[^\d.-]/g, "")) || 0,
          ],
        },
      ],
    },
  };

  const chartConfigEncoded = encodeURIComponent(JSON.stringify(chartConfig));

  // Embed images as Base64
  const logoBase64 = await getBase64Image(logoUrl);
  const chartBase64 = data.showChart
    ? await getBase64Image(`https://quickchart.io/chart?c=${chartConfigEncoded}`)
    : "";

  return `
<html>
  <head>
<style>
  body {
    font-family: Arial, Helvetica, sans-serif;
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
    background: #ffffff;
    border-radius: 16px;
    border: 1px solid #e0e4ec;
    position: relative;
    z-index: 1;
  }

  .table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 20px;
  }

  .table th, .table td {
    padding: 12px;
    border: 1px solid #ccc;
    text-align: left;
  }

  .table th {
    background-color: #e6e6e6;
    color: #000;
    font-weight: bold;
  }

  .table td {
    background-color: #fff;
    color: #000;
  }

  .table tr:nth-child(even) td {
    background-color: #f2f2f2;
  }

  .total p {
    font-weight: bold;
    color: #000;
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
    background-color: #eaeaea;
    color: #000;
    border-top: 1px solid #bbb;
    text-align: center;
    line-height: 1.6;
    font-size: 11px;
    border-radius: 0 0 16px 16px;
    box-sizing: border-box;
  }

  .footer a {
    color: #000;
    text-decoration: none;
    word-break: break-word;
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
