const fetch = require("node-fetch");

/**
 * Generate HTML invoice for free/pro users
 * @param {Object} data
 * @returns {string}
 */
async function generateInvoiceHTML(data) {
  const locale = data.locale || {};
  const items = Array.isArray(data.items) ? data.items : [];

  // Ensure there's an explicit source
  data.invoiceSource ||= "colorful";

  // -------------------------
  // Handle logo (base64 embed for Puppeteer)
  // -------------------------
  let logoHTML = `<svg id="invoice-logo" xmlns="http://www.w3.org/2000/svg" width="180" height="40" viewBox="0 0 180 40" style="display:block;margin-bottom:18px;">
    <rect width="180" height="40" fill="#2a3d66" rx="6" />
    <text x="12" y="26" fill="#fff" font-family="Arial,Helvetica,sans-serif" font-size="14">PDFify</text>
  </svg>`; // default fallback

  const userLogo = data.customLogoUrl;
  const freeUserLogo = data.isFreeUser ? "https://pdfify.pro/images/Logo.png" : "";

  const finalLogoUrl = userLogo && !userLogo.includes("example.png") ? userLogo : freeUserLogo;

  if (finalLogoUrl) {
    try {
      const isSvg = finalLogoUrl.endsWith(".svg");
      const mime = isSvg ? "image/svg+xml" : "image/png";
      const resp = await fetch(finalLogoUrl);
      const buffer = await resp.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      logoHTML = `<img id="invoice-logo" src="data:${mime};base64,${base64}" alt="Logo" style="height:60px;margin-bottom:18px;display:block;"/>`;
      console.log("[generateInvoiceHTML] ✅ Logo embedded from URL");
    } catch (err) {
      console.warn("[generateInvoiceHTML] ⚠️ Could not fetch logo, using fallback SVG", err.message);
    }
  }

  // -------------------------
  // Chart (only if showChart is true)
  // -------------------------
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
  const chartHTML = data.showChart
    ? `<div class="chart-container">
         <h2>${locale.breakdown || "Breakdown"}</h2>
         <img id="invoice-chart" src="https://quickchart.io/chart?c=${chartConfigEncoded}" alt="${locale.invoiceBreakdown || "Invoice Breakdown"}" style="max-width:500px;display:block;margin:auto;" />
       </div>`
    : "";

  // -------------------------
  // Watermark for basic + preview users
  // -------------------------
  const watermarkHTML =
    data.isBasicUser && data.isPreview
      ? `<div class="watermark" data-debug="watermark-visible">${locale.watermarkBasic || 'FOR PRODUCTION ONLY — NOT AVAILABLE IN BASIC VERSION'}</div>`
      : "";


  // -------------------------
  // Return full HTML
  // -------------------------
  return `
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      html, body { background: #fff !important; color: #000 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; }
      .container { max-width: 800px; margin: 20px auto; padding: 30px 24px 60px; background: #fff !important; border-radius: 8px; border: 1px solid #c5d0f9; box-shadow: none; position: relative; z-index: 1; }
      .table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
      .table th, .table td { padding: 10px; border: 1px solid #c5d0f9; text-align: left; }
      .table th { background-color: #dbe7ff; color: #2a3d66; font-weight: 600; }
      .table td { background-color: #fff; color: #2a3d66; }
      .table tr:nth-child(even) td { background-color: #f6f9fe; }
      .table tfoot td { background-color: #dbe7ff; font-weight: bold; color: #2a3d66; }
      .total p { font-weight: bold; color: #000; font-size: 1.05em; }
      .watermark { position: fixed; top: 40%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 44px; color: rgba(255, 204, 204, 0.8); font-weight: 900; pointer-events: none; user-select: none; z-index: 99; white-space: nowrap; }
      .footer { max-width: 800px; margin: 40px auto 10px auto; padding: 10px; font-size: 11px; border-top: 1px solid #c5d0f9; text-align: center; color: #2a3d66; background: #fff !important; }
      #__pdf_debug { page-break-inside: avoid; }
      [data-debug-overlay] { display: none !important; }
    </style>
  </head>
  <body>
    <div class="container">
      ${debugHTML}
      ${logoHTML}
      <h1 style="margin-top:8px;">${locale.invoiceTitle || "Invoice for"} ${data.customerName || "Customer"}</h1>
      <div class="invoice-header" style="display:flex;justify-content:space-between;gap:12px;margin-bottom:18px;">
        <div class="left" style="flex:1;">
          <p><strong>${locale.orderId || "Order ID"}:</strong> ${data.orderId || ""}</p>
          <p><strong>${locale.date || "Date"}:</strong> ${data.date || ""}</p>
        </div>
        <div class="right" style="flex:1;text-align:right;">
          <p><strong>${locale.customer || "Customer"}:</strong><br>${data.customerName || ""}</p>
          <p><strong>${locale.email || "Email"}:</strong><br><a href="mailto:${data.customerEmail || ""}">${data.customerEmail || ""}</a></p>
        </div>
      </div>

      <table class="table" role="table" aria-label="Invoice items">
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
              ? items.map(item => `<tr>
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
          <tr><td colspan="5">${locale.subtotal || "Subtotal"}</td><td>${data.subtotal || ""}</td></tr>
          <tr><td colspan="5">${locale.tax || "Tax"} (${data.taxRate || "21%"})</td><td>${data.tax || ""}</td></tr>
          <tr><td colspan="5">${locale.total || "Total"}</td><td>${data.total || ""}</td></tr>
        </tfoot>
      </table>

      <div class="total"><p>${locale.totalAmountDue || "Total Amount Due"}: ${data.total || ""}</p></div>
      ${chartHTML}
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

module.exports = { generateInvoiceHTML };
