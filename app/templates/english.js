const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const axios = require("axios");

/**
 * Convert image URL (PNG, JPG, or SVG) to Base64 string for embedding in PDF
 * Falls back to local PDFify logo if URL is missing or invalid
 * @param {string} url 
 * @returns {Promise<string>}
 */


async function getBase64Image(urlOrPath) {
  try {
    if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
      console.log("🔍 Fetching image:", urlOrPath);
      const response = await axios.get(urlOrPath, { responseType: "arraybuffer" });
      if (urlOrPath.endsWith(".svg")) {
        const pngBuffer = await sharp(response.data).png().toBuffer();
        console.log("✅ SVG converted to PNG, size:", pngBuffer.length);
        return `data:image/png;base64,${pngBuffer.toString("base64")}`;
      }
      const buffer = Buffer.from(response.data, "binary");
      console.log("✅ Image fetched, size:", buffer.length);
      return `data:image/png;base64,${buffer.toString("base64")}`;
    } else {
   
      const localPath = path.isAbsolute(urlOrPath) ? urlOrPath : path.join(__dirname, "../public/images", urlOrPath);
      const buffer = fs.readFileSync(localPath);
      console.log(`✅ Using local PDFify logo, size: ${buffer.length}`);
      return `data:image/png;base64,${buffer.toString("base64")}`;
    }
  } catch (err) {
    console.error("❌ Could not fetch image from URL, using default logo.", err.message);
   
    const fallbackPath = path.join(__dirname, "../public/images/Logo.png");
    const buffer = fs.readFileSync(fallbackPath);
    console.log(`✅ Using local PDFify logo, size: ${buffer.length}`);
    return `data:image/png;base64,${buffer.toString("base64")}`;
  }
}

/**
 * Generate HTML invoice for Puppeteer PDF rendering (free template)
 * @param {Object} data 
 * @returns {Promise<string>}
 */
async function generateInvoiceHTML(data) {
  const locale = data.locale || {};
  const items = Array.isArray(data.items) ? data.items : [];

  const logoUrl = typeof data.customLogoUrl === "string" && data.customLogoUrl.trim().length
    ? data.customLogoUrl.trim()
    : null; 

  const userClass = "pdfa-clean"; 

  const watermarkHTML =
    data.isBasicUser && data.isPreview
      ? `<div class="watermark">${locale.watermarkBasic || 'FOR PRODUCTION ONLY — NOT AVAILABLE IN BASIC VERSION'}</div>`
      : "";

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
  };
  const chartConfigEncoded = encodeURIComponent(JSON.stringify(chartConfig));

  const logoBase64 = await getBase64Image(logoUrl);
  const chartBase64 = data.showChart
    ? await getBase64Image(`https://quickchart.io/chart?c=${chartConfigEncoded}`)
    : "";

  return `
<html>
  <head>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap');

      body {
        font-family: 'Open Sans', sans-serif;
        color: #000000ff;
        background: #ffffff;
        margin: 0;
        padding: 0;
        min-height: 100vh;
      }

      .container {
        max-width: 800px;
        margin: 20px auto;
        padding: 30px 40px 60px;
        background: #ffffff;
        border-radius: 8px;
        border: 1px solid #888888;
      }

      .table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 20px;
      }

      .table th, .table td {
        padding: 10px;
        border: 1px solid #888888;
        text-align: left;
      }

      .table th {
        background-color: #dddddd;
        font-weight: 600;
      }

      .table td {
        background-color: #ffffff;
      }

      .table tr:nth-child(even) td {
        background-color: #f2f2f2;
      }

      .table tfoot td {
        background-color: #dddddd;
        font-weight: bold;
      }

      .total p {
        font-weight: bold;
        color: #000000ff;
        font-size: 1.1em;
      }

      .watermark {
        display: none !important; /* Free template disables watermark */
      }

      .footer {
        max-width: 800px;
        margin: 40px auto 10px auto;
        padding: 10px;
        font-size: 11px;
        color: #000000ff;
        text-align: center;
        border-top: 1px solid #888888;
      }

      .footer a {
        color: #000000ff;
        text-decoration: none;
      }

      .footer a:hover {
        text-decoration: underline;
      }
    </style>
  </head>
  <body class="${userClass}">
    <div class="container">
      ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" style="height:60px;" />` : ""}
      <h1>${locale.invoiceTitle || "Invoice for"} ${data.customerName || "Customer"}</h1>

      <div class="invoice-header">
        <div class="left">
          <p><strong>${locale.orderId || "Order ID"}:</strong> ${data.orderId || ""}</p>
          <p><strong>${locale.date || "Date"}:</strong> ${data.date || ""}</p>
        </div>
        <div class="right">
          <p><strong>${locale.customer || "Customer"}:</strong><br>${data.customerName || ""}</p>
          <p><strong>${locale.email || "Email"}:</strong><br><a href="mailto:${data.customerEmail || ""}">${data.customerEmail || ""}</a></p>
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

module.exports = { generateInvoiceHTML, getBase64Image };
