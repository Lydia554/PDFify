const axios = require("axios");
const sharp = require("sharp");

/**
 * Convert image URL to Base64
 */
async function getBase64Image(url) {
  try {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    const buffer = url.endsWith(".svg")
      ? await sharp(response.data).png().toBuffer()
      : Buffer.from(response.data, "binary");
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch (err) {
    console.error("Error fetching image:", url, err);
    return "";
  }
}

/**
 * Generate HTML for merchant PDF (PDF/A-3b, EN16931)
 */
async function generateMerchantInvoiceHTML(data) {
  const locale = data.locale || {};
  const items = Array.isArray(data.items) ? data.items : [];

  return `
<html>
<head>
<style>
  body { font-family: 'Liberation Sans', sans-serif; color: #000; background: #fff; margin: 0; padding: 0; }
  .container { max-width: 800px; margin: 20px auto; padding: 30px 40px 40px; border: 1px solid #000; background: #fff; }
  h1,h2,h3,p,td,th { color: #000; }
  .table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  .table th, .table td { padding: 10px; border: 1px solid #000; background: #fff; color: #000; }
  .table th { font-weight: bold; }
  .table tfoot td { font-weight: bold; background: #fff; }
  .total p { font-weight: bold; font-size: 1.1em; color: #000; }
  .footer { text-align: center; margin-top: 40px; padding: 10px; font-size: 11px; color: #000; border-top: 1px solid #000; }
  .pdfa-clean .watermark { display: none !important; }
</style>
</head>
<body class="pdfa-clean">
<div class="container">
<h1>${locale.invoiceTitle || "Invoice"} - ${data.customerName || ""}</h1>
<p><strong>${locale.orderId || "Order ID"}:</strong> ${data.orderId || ""}</p>
<p><strong>${locale.date || "Date"}:</strong> ${data.date || ""}</p>
<p><strong>${locale.customer || "Customer"}:</strong> ${data.customerName || ""}</p>
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
${items.length ? items.map(item => `
<tr>
  <td>${item.name || ""}</td>
  <td>${item.quantity || ""}</td>
  <td>${item.price || ""}</td>
  <td>${item.net || "-"}</td>
  <td>${item.tax || "-"}</td>
  <td>${item.total || ""}</td>
</tr>`).join("") : `<tr><td colspan="6">No items available</td></tr>`}
</tbody>
<tfoot>
<tr><td colspan="5">${locale.subtotal || "Subtotal"}</td><td>${data.subtotal || ""}</td></tr>
<tr><td colspan="5">${locale.tax || "Tax"} (${data.taxRate || "21%"})</td><td>${data.tax || ""}</td></tr>
<tr><td colspan="5">${locale.total || "Total"}</td><td>${data.total || ""}</td></tr>
</tfoot>
</table>
<div class="total"><p>${locale.totalAmountDue || "Total Amount Due"}: ${data.total || ""}</p></div>
</div>
<div class="footer">
<p>${locale.thanks || "Thanks!"}</p>
<p>Contact: <a href="mailto:pdfifyapi@gmail.com">pdfifyapi@gmail.com</a></p>
<p>&copy; 2025 PDFify</p>
</div>
</body>
</html>
  `;
}

module.exports = { generateMerchantInvoiceHTML, getBase64Image };
