const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const puppeteer = require("puppeteer");

// ---------------------
// Map Shopify order → PDF data
// ---------------------
function mapOrderToPdfData(order, shopConfig = {}) {
  const items = (order.line_items || []).map((item, index) => {
    const price = parseFloat(item.price || 0);
    const quantity = parseFloat(item.quantity || 1);
    const tax = (item.tax_lines || []).reduce((sum, t) => sum + parseFloat(t.price || 0), 0);
    const net = price * quantity;
    const total = net + tax;

    return {
      position: index + 1,
      name: item.title || item.name || "Item",
      quantity,
      unitCode: "EA",
      price,
      net,
      tax,
      total,
      taxRate: 21,
      currency: order.currency || "EUR",
    };
  });

  const subtotal = items.reduce((sum, i) => sum + i.net, 0);
  const taxTotal = items.reduce((sum, i) => sum + i.tax, 0);
  const total = subtotal + taxTotal;

  return {
    orderId: order.name || order.id,
    date: order.created_at ? new Date(order.created_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    customerName: `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim() || "Valued Customer",
    items,
    subtotal,
    tax: taxTotal,
    total,
    vatRate: 21,
    currency: order.currency || "EUR",
    iban: shopConfig.iban || "DE89370400440532013000",
    bic: shopConfig.bic || "COBADEFFXXX",
    paymentTerms: order.payment?.terms || "Due within 14 days",
    creator: "PDFify",
    companyName: shopConfig.companyName || "YOUR COMPANY GMBH",
    locale: { language: order.locale || "en" },
  };
}

// ---------------------
// Puppeteer PDF generation
// ---------------------
async function createBasePdf(data) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  const html = `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; }
          h1 { color: #123; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
          th { background-color: #eee; }
        </style>
      </head>
      <body>
        <h1>Invoice #${data.orderId}</h1>
        <p>Date: ${data.date}</p>
        <p>Customer: ${data.customerName}</p>
        <table>
          <tr>
            <th>Item</th><th>Qty</th><th>Price</th><th>Tax</th><th>Total</th>
          </tr>
          ${data.items.map(item => `
            <tr>
              <td>${item.name}</td>
              <td>${item.quantity}</td>
              <td>${item.price.toFixed(2)}</td>
              <td>${item.tax.toFixed(2)}</td>
              <td>${item.total.toFixed(2)}</td>
            </tr>
          `).join("")}
        </table>
        <p>Subtotal: ${data.subtotal.toFixed(2)}</p>
        <p>Tax: ${data.tax.toFixed(2)}</p>
        <p>Total: ${data.total.toFixed(2)}</p>
      </body>
    </html>
  `;

  await page.setContent(html, { waitUntil: "networkidle0" });

  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "40px", bottom: "40px", left: "40px", right: "40px" }
  });

  await browser.close();
  return pdfBuffer;
}

// ---------------------
// Generate ZUGFeRD PDF
// ---------------------
async function createShopifyInvoiceZugferd(order, shopConfig = {}) {
  const data = mapOrderToPdfData(order, shopConfig);
  const pdfBuffer = await createBasePdf(data);

  const form = new FormData();
  form.append("invoiceData", JSON.stringify(data));
  form.append("pdfFile", pdfBuffer, {
    filename: `Invoice-${data.orderId}.pdf`,
    contentType: "application/pdf",
    knownLength: pdfBuffer.length,
  });

  const pythonUrl = process.env.PYTHON_SERVICE_URL || "http://python-service:5000/generate-zugferd";

  try {
    const response = await axios.post(pythonUrl, form, {
      headers: form.getHeaders(),
      responseType: "arraybuffer",
      timeout: 20000,
      validateStatus: () => true,
    });

    if (response.status !== 200) {
      let text = "";
      try { text = response.data.toString("utf-8"); } catch {}
      console.error("❌ Python service returned error:", response.status, text);
      throw new Error(`Python ZUGFeRD service error: ${response.status}`);
    }

    const outputDir = path.resolve(__dirname, "../Generated");
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `Invoice-ZUGFeRD-${data.orderId}.pdf`);
    fs.writeFileSync(outputPath, response.data);

    console.log(`✅ Final ZUGFeRD PDF saved: ${outputPath}`);
    return { pdfPath: outputPath, pdfBuffer: response.data };

  } catch (err) {
    if (err.response) {
      let text = "";
      try { text = err.response.data.toString("utf-8"); } catch {}
      console.error("❌ Python error body:", text);
    }
    console.error("❌ Failed to connect to Python ZUGFeRD service:", err.message);
    throw err;
  }
}

module.exports = { createShopifyInvoiceZugferd, createBasePdf, mapOrderToPdfData };
