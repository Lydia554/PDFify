const puppeteer = require("puppeteer");

function generateCustomerInvoiceHTML(data) {
  const items = Array.isArray(data.items) ? data.items : [];

  return `
<html>
<head>
<style>
  body { font-family: 'Arial', sans-serif; color: #333; margin: 0; padding: 0; background: #f9f9f9; }
  .container { max-width: 800px; margin: 20px auto; padding: 30px; background: #fff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
  h1 { text-align: center; font-size: 28px; }
  .invoice-header { display: flex; justify-content: space-between; margin-bottom: 20px; }
  .table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  .table th, .table td { border: 1px solid #ddd; padding: 10px; text-align: left; }
  .table th { background: #f0f0f0; font-weight: bold; }
  .total { text-align: right; font-weight: bold; margin-top: 20px; }
  .footer { text-align: center; font-size: 12px; color: #777; margin-top: 30px; }
</style>
</head>
<body>
<div class="container">
<h1>Invoice</h1>

<div class="invoice-header">
  <div>
    <p><strong>From:</strong> ${data.shopName || ""}</p>
  </div>
  <div>
    <p><strong>Date:</strong> ${data.date || ""}</p>
    <p><strong>Invoice to:</strong> ${data.customerName || ""}</p>
  </div>
</div>

<table class="table">
<thead>
<tr>
  <th>Item</th>
  <th>Qty</th>
  <th>Price</th>
  <th>Total</th>
</tr>
</thead>
<tbody>
${items.length ? items.map(item => `
<tr>
  <td>${item.name || ""}</td>
  <td>${item.quantity || ""}</td>
  <td>${item.price || ""}</td>
  <td>${item.total || ""}</td>
</tr>`).join("") : `<tr><td colspan="4">No items available</td></tr>`}
</tbody>
</table>

<div class="total">Total: ${data.total || ""}</div>

<div class="footer">
<p>Thank you for your purchase!</p>
<p>Visit us: ${data.shopUrl || ""}</p>
</div>

</div>
</body>
</html>
`;
}

async function generateCustomerPDF(data) {
  const html = generateCustomerInvoiceHTML(data);
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  const pdfBuffer = await page.pdf({ format: "A4", printBackground: true, margin: { top: 40, bottom: 40 } });
  await browser.close();
  return pdfBuffer;
}

module.exports = { generateCustomerPDF };
