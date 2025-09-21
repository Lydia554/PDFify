const puppeteer = require("puppeteer");
const { PDFDocument } = require("pdf-lib");

/**
 * Safely parse number from Shopify string or number
 */
function parseNumber(value, fallback = 0) {
  const num = typeof value === "number" ? value : parseFloat(value);
  return isNaN(num) ? fallback : num;
}

/**
 * Map Shopify order to PDF/A data format
 */
function mapShopifyOrderToPdfData(order, options = {}) {
  const { merchant = false } = options;

  const items = (order.line_items || []).map(item => {
    const price = parseNumber(item.price);
    const quantity = parseNumber(item.quantity, 1);
    const tax = (item.tax_lines || []).reduce((sum, t) => sum + parseNumber(t.price), 0);
    const total = price * quantity + tax;

    return {
      name: item.title || "Unnamed item",
      quantity,
      price: price.toFixed(2),
      tax: tax.toFixed(2),
      total: total.toFixed(2),
      imageBase64: merchant ? "" : item.image || ""
    };
  });

  const subtotal = (parseNumber(order.subtotal_price)).toFixed(2);
  const tax = (parseNumber(order.total_tax)).toFixed(2);
  const total = (parseNumber(order.total_price)).toFixed(2);
  const taxRate = parseNumber(order.total_tax) && parseNumber(order.subtotal_price)
    ? ((parseNumber(order.total_tax) / parseNumber(order.subtotal_price)) * 100).toFixed(2) + "%"
    : "0%";

  return {
    customerName: `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim() || "Valued Customer",
    customerEmail: order.customer?.email || "N/A",
    orderId: order.name || order.id || "Unknown",
    date: order.created_at ? new Date(order.created_at).toLocaleDateString("de-DE") : new Date().toLocaleDateString("de-DE"),
    subtotal,
    tax,
    total,
    taxRate,
    items,
    merchant
  };
}

/**
 * Generate Shopify PDF HTML
 */
function generateShopifyPdfHTML(data) {
  return `
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; margin:0; padding:0; color:#000; }
    .container { max-width:800px; margin:20px auto; padding:30px; border:1px solid #000; background:#fff; }
    h1,h2,h3,p,td,th { color:#000; }
    .table { width:100%; border-collapse:collapse; margin-top:20px; }
    .table th, .table td { padding:8px; border:1px solid #000; text-align:left; }
    .table th { background:#ddd; }
    .table tfoot td { background:#ddd; font-weight:bold; }
    .footer { text-align:center; margin-top:30px; font-size:11px; color:#333; border-top:1px solid #000; padding-top:10px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Invoice for ${data.customerName}</h1>
    <p><strong>Order ID:</strong> ${data.orderId}</p>
    <p><strong>Date:</strong> ${data.date}</p>
    ${data.merchant ? "" : `<p><strong>Email:</strong> ${data.customerEmail}</p>`}

    <table class="table">
      <thead>
        <tr>
          <th>Item</th>
          <th>Qty</th>
          <th>Price</th>
          <th>Tax</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${data.items.map(item => `
          <tr>
            <td>${item.name}</td>
            <td>${item.quantity}</td>
            <td>${item.price}</td>
            <td>${item.tax}</td>
            <td>${item.total}</td>
          </tr>`).join("")}
      </tbody>
      <tfoot>
        <tr><td colspan="4">Subtotal</td><td>${data.subtotal}</td></tr>
        <tr><td colspan="4">Tax (${data.taxRate})</td><td>${data.tax}</td></tr>
        <tr><td colspan="4">Total</td><td>${data.total}</td></tr>
      </tfoot>
    </table>
  </div>
  <div class="footer">
    <p>Thanks for using PDFify!</p>
    <p>&copy; 2025 YourShop — All rights reserved.</p>
  </div>
</body>
</html>`;
}

/**
 * Embed ZUGFeRD XML into PDF
 */
async function embedZugferd(pdfBuffer, xmlBuffer) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  await pdfDoc.attach(xmlBuffer, "zugferd-invoice.xml", {
    mimeType: "application/xml",
    description: "ZUGFeRD invoice XML",
  });
  return pdfDoc.save();
}

/**
 * Generate Shopify merchant PDF
 */
async function createShopifyInvoicePdf(order, options = {}, xmlBuffer) {
  const data = mapShopifyOrderToPdfData(order, options);
  const html = generateShopifyPdfHTML(data);

  console.log("Generated HTML length:", html.length);

  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 1200 });

  await page.setContent(html, { waitUntil: "domcontentloaded" });
  const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });

  await browser.close();

  if (xmlBuffer) {
    return await embedZugferd(pdfBuffer, xmlBuffer);
  }

  return pdfBuffer;
}

module.exports = { createShopifyInvoicePdf, mapShopifyOrderToPdfData };
