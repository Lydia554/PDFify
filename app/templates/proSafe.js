const axios = require("axios");
const sharp = require("sharp");



/**
 * Convert image URL (PNG, JPG, or SVG) to Base64 string for embedding in PDF
 * @param {string} url 
 * @returns {Promise<string>}
 */
async function getBase64Image(url) {
  try {
    console.log("🔍 Fetching image:", url);
    const response = await axios.get(url, { responseType: "arraybuffer" });
    if (url.endsWith(".svg")) {
      const pngBuffer = await sharp(response.data).png().toBuffer();
      console.log("✅ SVG converted to PNG, size:", pngBuffer.length);
      return `data:image/png;base64,${pngBuffer.toString("base64")}`;
    }
    const buffer = Buffer.from(response.data, "binary");
    console.log("✅ Image fetched, size:", buffer.length);
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch (err) {
    console.error("❌ Error fetching image for PDF:", url, err);
    return "";
  }
}

/**
 * Generate HTML invoice for Puppeteer PDF rendering
 * @param {Object} data 
 * @returns {Promise<string>}
 */
async function generateInvoiceHTML_PdfaSafe(data) {
  const locale = data.locale || {};
  const items = Array.isArray(data.items) ? data.items : [];

  // Logo
  const logoUrl =
    typeof data.customLogoUrl === "string" && data.customLogoUrl.trim().length
      ? data.customLogoUrl.trim()
      : "https://pdfify.pro/images/Logo.png";

  // PDF/A safe class
  const userClass = "pdfa-clean";


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
    options: {
      plugins: {
        legend: { display: false }
      }
    }
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
        font-family: 'Arial', sans-serif;
        color: #000;
        background: #fff;
        margin: 0;
        padding: 0;
        min-height: 100vh;
      }

      .container {
        max-width: 800px;
        margin: 20px auto;
        padding: 30px 40px 40px;
        background: #fff;
        border: 1px solid #000;
      }

      h1, h2, h3, p, td, th {
        color: #000;
      }

      .table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 20px;
      }

      .table th, .table td {
        padding: 10px;
        border: 1px solid #000;
        text-align: left;
      }

      .table th {
        background-color: #ddd;
        font-weight: bold;
      }

      .table td {
        background-color: #fff;
      }

      .table tr:nth-child(even) td {
        background-color: #f2f2f2;
      }

      .table tfoot td {
        background-color: #ddd;
        font-weight: bold;
      }

      .total p {
        font-weight: bold;
        color: #000;
        font-size: 1.1em;
      }

      .watermark {
        position: fixed;
        top: 40%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(-45deg);
        font-size: 50px;
        color: #999;
        font-weight: 700;
        pointer-events: none;
        user-select: none;
        z-index: 9999;
        white-space: nowrap;
      }

      .footer {
        text-align: center;
        margin-top: 40px;
        padding: 10px;
        font-size: 11px;
        color: #333;
        border-top: 1px solid #000;
      }

      .footer a {
        color: #000;
        text-decoration: none;
      }

      .footer a:hover {
        text-decoration: underline;
      }

      /* PDF/A-3b overrides */
      .pdfa-clean .watermark { display: none !important; }
    </style>
  </head>
  <body class="${userClass}">
    <div class="container">
      ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" style="height:60px;" />` : ""}
      <h1>${locale.invoiceTitle || "Invoice for"} ${data.customerName || "Customer"}</h1>

      <div class="invoice-header">
        <p><strong>${locale.orderId || "Order ID"}:</strong> ${data.orderId || ""}</p>
        <p><strong>${locale.date || "Date"}:</strong> ${data.date || ""}</p>
        <p><strong>${locale.customer || "Customer"}:</strong> ${data.customerName || ""}</p>
        <p><strong>${locale.email || "Email"}:</strong> ${data.customerEmail || ""}</p>
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
              <img src="${chartBase64}" alt="${locale.invoiceBreakdown || "Invoice Breakdown"}" style="max-width:400px;display:block;margin:auto;" />
            </div>`
          : ""
      }
    </div>

    ${watermarkHTML}

    <div class="footer">
      <p>${locale.thanks || "Thanks for using our service!"}</p>
      <p>${locale.contact || "Contact us at"} <a href="mailto:pdfifyapi@gmail.com">pdfifyapi@gmail.com</a></p>
      <p>&copy; 2025 PDFify — ${locale.copyright || "All rights reserved."}</p>
    </div>
  </body>
</html>
  `;
}

module.exports = { generateInvoiceHTML_PdfaSafe, getBase64Image };
