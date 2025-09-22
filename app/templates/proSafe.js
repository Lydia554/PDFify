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
 * Black-and-white, PDF/A-3b safe, EN16931-compliant
 * @param {Object} data 
 * @returns {Promise<string>}
 */
async function generateInvoiceHTML_PdfaSafe(data) {
  const locale = data.locale || {};
  const items = Array.isArray(data.items) ? data.items : [];

  return `
<html>
  <head>
    <style>
      body {
        font-family: 'Liberation Sans', sans-serif;
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
        background-color: #fff; /* strictly white */
        color: #000;
      }
      .table th {
        font-weight: bold;
      }
      .table tfoot td {
        font-weight: bold;
        background-color: #fff; /* strictly white */
      }
      .total p {
        font-weight: bold;
        color: #000;
        font-size: 1.1em;
      }
      .footer {
        text-align: center;
        margin-top: 40px;
        padding: 10px;
        font-size: 11px;
        color: #000;
        border-top: 1px solid #000;
      }
      .pdfa-clean .watermark { display: none !important; }
    </style>
  </head>
  <body class="pdfa-clean">
    <div class="container">
      <h1>${locale.invoiceTitle || "Invoice for"} ${data.customerName || "Customer"}</h1>

      <div class="invoice-header">
        <p><strong>${locale.orderId || "Order ID"}:</strong> ${data.orderId || ""}</p>
        <p><strong>${locale.date || "Date"}:</strong> ${data.date || ""}</p>
        <p><strong>${locale.customer || "Customer"}:</strong> ${data.customerName || ""}</p>
        <p><strong>${locale.email || "Email"}:</strong> ${data.customerEmail || ""}</p>
        <p><strong>IBAN:</strong> ${data.iban || ""}</p>
        <p><strong>BIC:</strong> ${data.bic || ""}</p>
        <p><strong>Payment Terms:</strong> ${data.paymentTerms || ""}</p>
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
    </div>

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
