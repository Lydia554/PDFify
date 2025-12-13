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
async function generateInvoiceHTML(data) {
  const locale = data.locale || {};
  const items = Array.isArray(data.items) ? data.items : [];
  const seller = data.seller || { name: data.shopName, address: " ", email: " " };
  const buyer = data.buyer || { name: data.customerName, address: " " };
  const logoUrl = data.customLogoUrl || ""; 

  return `
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Invoice</title>
    <style>
      :root {
        --font-family: 'Liberation Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        --primary-color: #0d1b2a; /* Deep Navy Blue */
        --secondary-color: #415a77; /* Shadow Blue */
        --accent-color: #1b998b; /* Muted Teal */
        --background-color: #f8f9fa;
        --text-color: #343a40;
        --light-gray: #e9ecef;
        --border-color: #dee2e6;
      }
      body {
        font-family: var(--font-family);
        color: var(--text-color);
        background: #fff;
        margin: 0;
        padding: 0;
        font-size: 14px;
      }
      .invoice-container {
        max-width: 800px;
        margin: 40px auto;
        padding: 40px;
        border: 1px solid var(--border-color);
        background: #fff;
      }
      .invoice-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding-bottom: 30px;
        border-bottom: 2px solid var(--primary-color);
        margin-bottom: 40px;
      }
      .logo {
        max-height: 80px;
        max-width: 200px;
      }
      .invoice-title-section {
        text-align: right;
      }
      .invoice-title {
        font-size: 36px;
        font-weight: 700;
        color: var(--primary-color);
        margin: 0 0 10px 0;
      }
      .invoice-meta p {
        margin: 0;
        line-height: 1.5;
        font-size: 14px;
        color: var(--secondary-color);
      }
      .invoice-meta p strong {
        color: var(--primary-color);
      }
      .parties-section {
        display: flex;
        justify-content: space-between;
        margin-bottom: 40px;
      }
      .party {
        width: 48%;
      }
      .party h3 {
        font-size: 16px;
        font-weight: 700;
        color: var(--secondary-color);
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 8px;
        margin: 0 0 8px 0;
      }
      .party p {
        margin: 0;
        line-height: 1.6;
      }
      .invoice-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 30px;
      }
      .invoice-table thead {
        background-color: var(--primary-color);
        color: #fff;
      }
      .invoice-table th {
        font-weight: 700;
        padding: 15px;
        text-align: left;
      }
      .invoice-table td {
        padding: 15px;
        border-bottom: 1px solid var(--border-color);
      }
      .invoice-table tbody tr:nth-child(even) {
        background-color: var(--background-color);
      }
      .invoice-table .text-right {
        text-align: right;
      }
      .totals-section {
        display: flex;
        justify-content: flex-end;
      }
      .totals-table {
        width: 50%;
        max-width: 350px;
      }
      .totals-table td {
        padding: 12px 15px;
      }
      .totals-table .label {
        font-weight: 700;
        color: var(--secondary-color);
      }
      .totals-table .amount {
        text-align: right;
      }
      .amount-due-row .label, .amount-due-row .amount {
        font-size: 1.2em;
        font-weight: 700;
        color: var(--accent-color);
        border-top: 2px solid var(--accent-color);
        padding-top: 15px;
      }
      .footer {
        border-top: 1px solid var(--border-color);
        padding-top: 20px;
        margin-top: 40px;
        text-align: center;
        font-size: 12px;
        color: #888;
      }
    </style>
  </head>
  <body>
    <div class="invoice-container">
      <header class="invoice-header">
        <div>
          ${logoUrl ? `<img src="${logoUrl}" alt="Company Logo" class="logo">` : `<h1>${seller.name}</h1>`}
        </div>
        <div class="invoice-title-section">
          <p class="invoice-title">${locale.invoiceTitle || "INVOICE"}</p>
          <div class="invoice-meta">
            <p><strong>${locale.orderId || "Invoice #"}:</strong> ${data.orderId || ""}</p>
            <p><strong>${locale.date || "Date"}:</strong> ${data.date || ""}</p>
          </div>
        </div>
      </header>
      <section class="parties-section">
        <div class="party">
          <h3>From</h3>
          <p><strong>${seller.name}</strong></p>
        </div>
        <div class="party">
          <h3>To</h3>
          <p><strong>${buyer.name}</strong></p>
        </div>
      </section>
      <table class="invoice-table">
        <thead>
          <tr>
            <th>${locale.item || "Item"}</th>
            <th class="text-right">${locale.quantity || "Quantity"}</th>
            <th class="text-right">${locale.price || "Price"}</th>
            <th class="text-right">${locale.total || "Total"}</th>
          </tr>
        </thead>
        <tbody>
          ${
            items.length
              ? items.map(item => `
                <tr>
                  <td>${item.name || ""}</td>
                  <td class="text-right">${item.quantity}</td>
                  <td class="text-right">${item.price}</td>
                  <td class="text-right">${item.total}</td>
                </tr>`).join("")
              : `<tr><td colspan="4">No items available</td></tr>`
          }
        </tbody>
      </table>
      <section class="totals-section">
        <table class="totals-table">
          <tbody>
            <tr>
              <td class="label">${locale.subtotal || "Subtotal"}</td>
              <td class="amount">${data.subtotal}</td>
            </tr>
            <tr>
              <td class="label">${locale.tax || "Tax"}</td>
              <td class="amount">${data.tax}</td>
            </tr>
            <tr class="amount-due-row">
              <td class="label">${locale.total || "Total Due"}</td>
              <td class="amount">${data.total}</td>
            </tr>
          </tbody>
        </table>
      </section>
      <footer class="footer">
          <p><strong>${locale.thanks || "Thank you for your business!"}</strong></p>
          <p>&copy; 2025 ${seller.name}. ${locale.copyright || "All rights reserved."}</p>
      </footer>
    </div>
  </body>
</html>
  `;
}

module.exports = { generateInvoiceHTML, getBase64Image };

