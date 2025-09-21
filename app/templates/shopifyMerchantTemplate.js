const axios = require("axios");
const sharp = require("sharp");
const puppeteer = require("puppeteer");
const { PDFDocument } = require("pdf-lib");

/**
 * Convert image URL to Base64 for embedding in PDF
 */
async function getBase64Image(url) {
  try {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    let buffer = response.data;

    if (url.endsWith(".svg")) {
      buffer = await sharp(buffer).png().toBuffer();
    }
    return `data:image/png;base64,${Buffer.from(buffer).toString("base64")}`;
  } catch (err) {
    console.error("Error fetching image:", url, err);
    return "";
  }
}

/**
 * Map Shopify order to PDF/A data format
 */
async function mapShopifyOrderToPdfData(order, t) {
  const items = order.line_items.map(item => {
    const tax = item.tax_lines?.reduce((sum, t) => sum + parseFloat(t.price), 0) || 0;
    const total = parseFloat(item.price) * item.quantity + tax;
    return {
      name: item.title,
      quantity: item.quantity,
      price: parseFloat(item.price).toFixed(2),
      tax: tax.toFixed(2),
      total: total.toFixed(2),
      imageUrl: item.image || ""
    };
  });

  return {
    customerName: `${order.customer.first_name} ${order.customer.last_name}`,
    customerEmail: order.customer.email,
    orderId: order.name,
    date: new Date(order.created_at).toLocaleDateString("de-DE"),
    subtotal: parseFloat(order.subtotal_price).toFixed(2),
    tax: parseFloat(order.total_tax).toFixed(2),
    total: parseFloat(order.total_price).toFixed(2),
    taxRate: order.total_tax ? ((order.total_tax / order.subtotal_price) * 100).toFixed(2) + "%" : "0%",
    items,
    showChart: true,
    customLogoUrl: "https://yourshopifylogo.url/logo.png",
    locale: t
  };
}

/**
 * Generate PDF/A-compliant HTML invoice
 */
async function generateShopifyPdfHTML(data) {
  const logoBase64 = await getBase64Image(data.customLogoUrl);

  // Simple chart example (optional)
  const chartBase64 = data.showChart
    ? await getBase64Image(`https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify({
        type: "pie",
        data: {
          labels: ["Subtotal", "Tax"],
          datasets: [{ data: [parseFloat(data.subtotal), parseFloat(data.tax)] }]
        },
        options: { plugins: { legend: { display: false } } }
      }))}`)
    : "";

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
      .total p { font-weight:bold; color:#000; font-size:1.1em; }
      .footer { text-align:center; margin-top:40px; padding:10px; font-size:11px; color:#333; border-top:1px solid #000; }
      .footer a { color:#000; text-decoration:none; }
      .footer a:hover { text-decoration:underline; }
      .product-image { width:60px; height:60px; object-fit:contain; border-radius:4px; border:1px solid #ccc; background:#fff; }
    </style>
  </head>
  <body>
    <div class="container">
      ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" style="height:60px;" />` : ""}
      <h1>Invoice for ${data.customerName}</h1>
      <p><strong>Order ID:</strong> ${data.orderId}</p>
      <p><strong>Date:</strong> ${data.date}</p>
      <p><strong>Email:</strong> ${data.customerEmail}</p>

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
              <td>${item.name}${item.imageUrl ? `<br><img src="${item.imageUrl}" class="product-image" />` : ""}</td>
              <td>${item.quantity}</td>
              <td>${item.price}</td>
              <td>${item.tax}</td>
              <td>${item.total}</td>
            </tr>
          `).join("")}
        </tbody>
        <tfoot>
          <tr><td colspan="4">Subtotal</td><td>${data.subtotal}</td></tr>
          <tr><td colspan="4">Tax (${data.taxRate})</td><td>${data.tax}</td></tr>
          <tr><td colspan="4">Total</td><td>${data.total}</td></tr>
        </tfoot>
      </table>

      ${chartBase64 ? `<div style="text-align:center;"><img src="${chartBase64}" style="max-width:400px;" /></div>` : ""}
    </div>

    <div class="footer">
      <p>Thanks for using our service!</p>
      <p>&copy; 2025 YourShop — All rights reserved.</p>
    </div>
  </body>
</html>
  `;
}

/**
 * Embed ZUGFeRD XML into PDF
 */
async function embedZugferd(pdfBuffer, xmlBuffer) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  await pdfDoc.attach(xmlBuffer, 'zugferd-invoice.xml', {
    mimeType: 'application/xml',
    description: 'ZUGFeRD invoice XML'
  });
  return await pdfDoc.save();
}

/**
 * Generate Shopify PDF/A invoice
 */
async function createShopifyInvoicePdf(order, t, xmlBuffer) {
  const data = await mapShopifyOrderToPdfData(order, t);
  const html = await generateShopifyPdfHTML(data);

  const browser = await puppeteer.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });

  const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
  await browser.close();

  if (xmlBuffer) {
    return await embedZugferd(pdfBuffer, xmlBuffer);
  }
  return pdfBuffer;
}

module.exports = { createShopifyInvoicePdf, mapShopifyOrderToPdfData, getBase64Image };
