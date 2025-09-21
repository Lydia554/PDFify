const puppeteer = require("puppeteer");
const { PDFDocument } = require("pdf-lib");

/**
 * Map Shopify order to PDF/A data format
 */
function mapShopifyOrderToPdfData(order) {
  const items = order.line_items.map(item => {
    const tax = item.tax_lines?.reduce((sum, t) => sum + parseFloat(t.price), 0) || 0;
    const total = parseFloat(item.price) * item.quantity + tax;

    return {
      name: item.title,
      quantity: item.quantity,
      price: parseFloat(item.price).toFixed(2),
      tax: tax.toFixed(2),
      total: total.toFixed(2)
    };
  });

  return {
    customerName: `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim(),
    orderId: order.name || order.id,
    date: new Date(order.created_at).toLocaleDateString("de-DE"),
    subtotal: parseFloat(order.subtotal_price || 0).toFixed(2),
    tax: parseFloat(order.total_tax || 0).toFixed(2),
    total: parseFloat(order.total_price || 0).toFixed(2),
    taxRate: order.total_tax && order.subtotal_price
      ? ((order.total_tax / order.subtotal_price) * 100).toFixed(2) + "%"
      : "0%",
    items
  };
}

/**
 * Generate HTML for merchant PDF (no images, no external links)
 */
function generateMerchantPdfHTML(data) {
  return `
<html>
  <head>
    <style>
      body { font-family: Arial, sans-serif; color: #000; background: #fff; margin:0; padding:0; }
      .container { max-width:800px; margin:20px auto; padding:30px 40px 40px; background:#fff; border:1px solid #000; }
      h1,h2,h3,p,td,th { color:#000; }
      .table { width:100%; border-collapse:collapse; margin-bottom:20px; }
      .table th, .table td { padding:10px; border:1px solid #000; text-align:left; }
      .table th { background-color:#ddd; font-weight:bold; }
      .table td { background-color:#fff; }
      .table tr:nth-child(even) td { background-color:#f2f2f2; }
      .table tfoot td { background-color:#ddd; font-weight:bold; }
      .footer { text-align:center; margin-top:40px; padding:10px; font-size:11px; color:#333; border-top:1px solid #000; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Invoice for ${data.customerName}</h1>
      <p><strong>Order ID:</strong> ${data.orderId}</p>
      <p><strong>Date:</strong> ${data.date}</p>

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
</html>
  `;
}

/**
 * Generate merchant PDF
 */
async function createMerchantInvoicePdf(order, xmlBuffer) {
  const data = mapShopifyOrderToPdfData(order);
  const html = generateMerchantPdfHTML(data);

  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  await page.setViewport({ width: 800, height: 1200 });
  await page.setContent(html, { waitUntil: "domcontentloaded" });

  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "20px", bottom: "20px", left: "20px", right: "20px" },
  });

  await browser.close();

  if (xmlBuffer) {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    await pdfDoc.attach(xmlBuffer, "zugferd-invoice.xml", {
      mimeType: "application/xml",
      description: "ZUGFeRD invoice XML"
    });
    return pdfDoc.save();
  }

  return pdfBuffer;
}

module.exports = { createMerchantInvoicePdf };
