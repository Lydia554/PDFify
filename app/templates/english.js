const fetch = require("node-fetch");

/**
 * Generate HTML invoice for free/pro users
 * @param {Object} data
 * @returns {string}
 */
async function generateInvoiceHTML(data) {
  const locale = data.locale || {};
  const items = Array.isArray(data.items) ? data.items : [];

  // Default invoice source
  data.invoiceSource ||= "colorful";

  // -------------------------
  // Logo
  // -------------------------
  let logoHTML = "";
  const userLogo = data.customLogoUrl;
  if (userLogo && !userLogo.includes("example.png")) {
    try {
      const isSvg = userLogo.endsWith(".svg");
      const mime = isSvg ? "image/svg+xml" : "image/png";
      const resp = await fetch(userLogo);
      const buffer = await resp.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      logoHTML = `<img id="invoice-logo" src="data:${mime};base64,${base64}" alt="Logo" style="height:60px;margin-bottom:18px;display:block;"/>`;
    } catch (err) {
      console.warn("[generateInvoiceHTML] ⚠️ Could not fetch logo, skipping logo", err.message);
    }
  }

  // -------------------------
  // Chart
  // -------------------------
  const chartHTML = data.showChart
    ? `<div class="chart-container">
         <h2>${locale.breakdown || "Breakdown"}</h2>
         <img src="https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify({
            type: "pie",
            data: {
              labels: ["Subtotal", "Tax"],
              datasets: [{
                data: [
                  Number(String(data.subtotal).replace(/[^\d.-]/g, "")) || 0,
                  Number(String(data.tax).replace(/[^\d.-]/g, "")) || 0
                ]
              }]
            }
         }))}" alt="Invoice Breakdown" style="max-width:500px;display:block;margin:auto;" />
       </div>` : "";

  // -------------------------
  // Watermark
  // -------------------------
  const watermarkHTML = data.isBasicUser && data.isPreview
      ? `<div class="watermark">${locale.watermarkBasic || 'FOR PRODUCTION ONLY — NOT AVAILABLE IN BASIC VERSION'}</div>` : "";

  // -------------------------
  // Return full HTML
  // -------------------------
  return `
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
html, body { background: #fff !important; color: #000 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; margin:0; padding:0; font-family: Arial, Helvetica, sans-serif; }
.container { max-width:800px; margin:20px auto; padding:30px 24px 60px; background:#fff; border-radius:8px; border:1px solid #c5d0f9; }
.table { width:100%; border-collapse:collapse; margin-bottom:20px; }
.table th, .table td { padding:10px; border:1px solid #c5d0f9; text-align:left; }
.table th { background-color:#dbe7ff; color:#2a3d66; font-weight:600; }
.table td { background-color:#fff; color:#2a3d66; }
.table tr:nth-child(even) td { background-color:#f6f9fe; }
.table tfoot td { background-color:#dbe7ff; font-weight:bold; color:#2a3d66; }
.total p { font-weight:bold; color:#000; font-size:1.05em; }
.watermark { position: fixed; top: 40%; left:50%; transform:translate(-50%, -50%) rotate(-45deg); font-size:44px; color: rgba(255,204,204,0.8); font-weight:900; pointer-events:none; user-select:none; z-index:99; white-space:nowrap; }
.footer { max-width:800px; margin:40px auto 10px auto; padding:10px; font-size:11px; border-top:1px solid #c5d0f9; text-align:center; color:#2a3d66; background:#fff; }
</style>
</head>
<body>
<div class="container">
  ${logoHTML}
  <h1>${locale.invoiceTitle || "Invoice for"} ${data.customerName || "Customer"}</h1>

  <div class="invoice-header" style="display:flex; justify-content:space-between; gap:12px; margin-bottom:18px;">
    <div class="left" style="flex:1;">
      <p><strong>${locale.orderId || "Order ID"}:</strong> ${data.orderId || ""}</p>
      <p><strong>${locale.date || "Date"}:</strong> ${data.date || ""}</p>
      ${data.paymentTerms ? `<p><strong>${locale.paymentTerms || "Payment Terms"}:</strong> ${data.paymentTerms}</p>` : ""}
      ${data.iban ? `<p><strong>IBAN:</strong> ${data.iban}</p>` : ""}
      ${data.bic ? `<p><strong>BIC:</strong> ${data.bic}</p>` : ""}
    </div>
    <div class="right" style="flex:1;text-align:right;">
      <p><strong>${locale.customer || "Customer"}:</strong><br>${data.customerName || ""}</p>
      <p><strong>${locale.email || "Email"}:</strong><br><a href="mailto:${data.customerEmail || ""}">${data.customerEmail || ""}</a></p>
    </div>
  </div>

  <table class="table" role="table" aria-label="Invoice items">
    <thead>
      <tr>
        <th>${locale.position || "Pos"}</th>
        <th>${locale.item || "Item"}</th>
        <th>${locale.quantity || "Quantity"}</th>
        <th>${locale.price || "Price"}</th>
        <th>${locale.net || "Net"}</th>
        <th>${locale.tax || "Tax"}</th>
        <th>${locale.total || "Total"}</th>
      </tr>
    </thead>
    <tbody>
      ${items.length
        ? items.map(item => `<tr>
            <td>${item.position || ""}</td>
            <td>${item.name || ""}</td>
            <td>${item.quantity || ""}</td>
            <td>${item.price || ""}</td>
            <td>${item.net || "-"}</td>
            <td>${item.tax || "-"}</td>
            <td>${item.total || ""}</td>
          </tr>`).join("")
        : `<tr><td colspan="7">${locale.noItemsAvailable || "No items available"}</td></tr>`}
    </tbody>
    <tfoot>
      <tr><td colspan="6">${locale.subtotal || "Subtotal"}</td><td>${data.subtotal || ""}</td></tr>
      <tr><td colspan="6">${locale.taxLabel || "Tax"} (${data.taxRate || "0%"})</td><td>${data.tax || ""}</td></tr>
      <tr><td colspan="6">${locale.total || "Total"}</td><td>${data.total || ""}</td></tr>
    </tfoot>
  </table>

  <div class="total"><p>${locale.totalAmountDue || "Total Amount Due"}: ${data.total || ""}</p></div>
  ${chartHTML}
</div>

${watermarkHTML}

<div class="footer">
   <p>${locale.thanks || "Thanks for using our service!"}</p>
      <p>${locale.contact || "For questions, contact us at"} <a href="mailto:pdfifyapi@gmail.com">pdfifyapi@gmail.com</a>.</p>
      <p>&copy; 2025 — ${locale.copyright || "All rights reserved."}</p>
</div>
</body>
</html>
`;
}

module.exports = { generateInvoiceHTML };
