const axios = require("axios");
const sharp = require("sharp");

/**
 * Convert image URL (PNG, JPG, or SVG) to Base64 string for embedding in PDF
 * @param {string} url 
 * @returns {Promise<string>}
 */
async function getBase64Image(url) {
  try {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    if (url.endsWith(".svg")) {
      // Convert SVG to PNG in memory
      const pngBuffer = await sharp(response.data).png().toBuffer();
      return `data:image/png;base64,${pngBuffer.toString("base64")}`;
    }
    return `data:image/png;base64,${Buffer.from(response.data, "binary").toString("base64")}`;
  } catch (err) {
    console.error("❌ Error fetching image for PDF:", url, err);
    return "";
  }
}

/**
 * Normalize a value for PDF display
 * - Numbers => string with 2 decimals
 * - Strings => untouched
 * - Objects/arrays => JSON string (logged)
 * - undefined/null => fallback
 */
function normalizeValue(val, fallback = "") {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "number") return val.toFixed(2);
  if (typeof val === "string") return val;
  if (typeof val === "object") {
    console.warn("⚠️ Found object/array in invoice field, using fallback:", val);
    return fallback;
  }
  return fallback;
}

async function generateInvoiceHTML(data) {
  const locale = data.locale || {};
  const items = Array.isArray(data.items) ? data.items : [];

  // Log full invoice data for debugging
  console.log("📝 Invoice data before normalization:", JSON.stringify(data, null, 2));

  // Normalize all item fields
  const normalizedItems = items.map(item => ({
    name: normalizeValue(item.name),
    quantity: normalizeValue(item.quantity),
    price: normalizeValue(item.price),
    net: normalizeValue(item.net, "-"),
    tax: normalizeValue(item.tax, "-"),
    total: normalizeValue(item.total),
  }));

  // Normalize totals
  const subtotal = normalizeValue(data.subtotal);
  const tax = normalizeValue(data.tax);
  const total = normalizeValue(data.total);

  const logoUrl =
    typeof data.customLogoUrl === "string" && data.customLogoUrl.trim().length > 0
      ? data.customLogoUrl.trim()
      : "https://pdfify.pro/images/Logo.png";

  const userClass = "pdfa-clean"; // PDF/A-3b safe

  const watermarkHTML =
    data.isBasicUser && data.isPreview
      ? `<div class="watermark">${locale.watermarkBasic || 'FOR PRODUCTION ONLY — NOT AVAILABLE IN BASIC VERSION'}</div>`
      : "";

  // Chart config
  const chartConfig = {
    type: "pie",
    data: {
      labels: ["Subtotal", "Tax"],
      datasets: [
        {
          data: [
            parseFloat(subtotal) || 0,
            parseFloat(tax) || 0,
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

  // Validate embedded images
  if (logoBase64.length < 50) console.warn("⚠️ Logo Base64 seems too short, check image URL:", logoUrl);
  if (data.showChart && chartBase64.length < 50) console.warn("⚠️ Chart Base64 seems too short, check QuickChart response");

  return `
<html>
  <head>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap');

      body { font-family: 'Open Sans', sans-serif; color: #333; background: #f4f7fb; margin: 0; padding: 0; min-height: 100vh; }
      .container { max-width: 800px; margin: 20px auto; padding: 30px 40px 160px; background: linear-gradient(to bottom right, #ffffff, #f8fbff); border-radius: 16px; border: 1px solid #e0e4ec; position: relative; z-index: 1; }
      .table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
      .table th, .table td { padding: 14px; border: 1px solid #dee2ef; text-align: left; }
      .table th { background-color: #dbe7ff; color: #2a3d66; font-weight: 600; }
      .table td { background-color: #fdfdff; color: #444; }
      .table tr:nth-child(even) td { background-color: #f6f9fe; }
      .table tfoot td { background-color: #dbe7ff; font-weight: bold; color: #2a3d66; }
      .total p { font-weight: bold; color: #000000ff; }
      .watermark { position: fixed; top: 40%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 60px; color: #ffcccc; font-weight: 900; pointer-events: none; user-select: none; z-index: 9999; white-space: nowrap; }
      .footer { position: static; max-width: 800px; margin: 40px auto 10px auto; padding: 10px 20px; background-color: #f0f2f7; color: #555; border-top: 2px solid #cbd2e1; text-align: center; line-height: 1.6; font-size: 11px; border-radius: 0 0 16px 16px; box-sizing: border-box; }
      .footer a { color: #4a69bd; text-decoration: none; }
      .footer a:hover { text-decoration: underline; }
      .pdfa-clean .watermark { display: none !important; }
    </style>
  </head>
  <body class="${userClass}">
    <div class="container">
      ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" style="height:60px;" />` : ""}
      <h1>${locale.invoiceTitle || "Invoice for"} ${normalizeValue(data.customerName)}</h1>

      <div class="invoice-header">
        <div class="left">
          <p><strong>${locale.orderId || "Order ID"}:</strong> ${normalizeValue(data.orderId)}</p>
          <p><strong>${locale.date || "Date"}:</strong> ${normalizeValue(data.date)}</p>
        </div>
        <div class="right">
          <p><strong>${locale.customer || "Customer"}:</strong><br>${normalizeValue(data.customerName)}</p>
          <p><strong>${locale.email || "Email"}:</strong><br><a href="mailto:${normalizeValue(data.customerEmail)}">${normalizeValue(data.customerEmail)}</a></p>
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
            normalizedItems.length > 0
              ? normalizedItems.map(item => `
                <tr>
                  <td>${item.name}</td>
                  <td>${item.quantity}</td>
                  <td>${item.price}</td>
                  <td>${item.net}</td>
                  <td>${item.tax}</td>
                  <td>${item.total}</td>
                </tr>
              `).join("")
              : `<tr><td colspan="6">${locale.noItemsAvailable || "No items available"}</td></tr>`
          }
        </tbody>
        <tfoot>
          <tr>
            <td colspan="5">${locale.subtotal || "Subtotal"}</td>
            <td>${subtotal}</td>
          </tr>
          <tr>
            <td colspan="5">${locale.tax || "Tax"} (${normalizeValue(data.taxRate, '21%')})</td>
            <td>${tax}</td>
          </tr>
          <tr>
            <td colspan="5">${locale.total || "Total"}</td>
            <td>${total}</td>
          </tr>
        </tfoot>
      </table>

      <div class="total">
        <p>${locale.totalAmountDue || "Total Amount Due"}: ${total}</p>
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
