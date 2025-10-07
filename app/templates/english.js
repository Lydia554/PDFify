const fs = require("fs");
const fetch = require("node-fetch");
const sharp = require("sharp");

/**
 * Generate HTML invoice for free/pro users
 * @param {Object} data
 * @returns {string}
 */
async function generateInvoiceHTML(data) {
  const locale = data.locale || {};
  const items = Array.isArray(data.items) ? data.items : [];

  // Determine free/pro user safely
  const planType = (data?.planType || "").toLowerCase();
  const isFree = planType === "free" || planType === "starter";

  data.invoiceSource ||= "colorful";

  // Colors
  const primaryColor = isFree ? "#888888" : "#2a3d66";
  const secondaryColor = isFree ? "#cccccc" : "#dbe7ff";
  const borderColor = isFree ? "#aaaaaa" : "#c5d0f9";
  const evenRowColor = isFree ? "#eee" : "#f6f9fe";

  // Logo
  let logoHTML = "";

  if (isFree) {
    logoHTML = `<img src="https://pdfify.pro/images/Logo.png" style="height:60px;display:block;" alt="PDFify Logo" />`;
  } else if (data.customLogoUrl && data.customLogoUrl.trim() !== "") {
    try {
      const customLogo = data.customLogoUrl;
      let buffer;

      if (customLogo.startsWith("http://") || customLogo.startsWith("https://")) {
        const resp = await fetch(customLogo);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        buffer = Buffer.from(await resp.arrayBuffer());
      } else if (customLogo.startsWith("data:")) {
        const base64Data = customLogo.split(",")[1];
        buffer = Buffer.from(base64Data, "base64");
      } else {
        if (!fs.existsSync(customLogo)) throw new Error("Local logo file not found");
        buffer = fs.readFileSync(customLogo);
      }

      const pngBuffer = customLogo.endsWith(".svg") || customLogo.startsWith("data:image/svg+xml")
        ? await sharp(buffer).png().resize({ height: 60 }).toBuffer()
        : buffer;

      const base64 = pngBuffer.toString("base64");
      logoHTML = `<img src="data:image/png;base64,${base64}" style="height:60px;display:block;" />`;
    } catch (err) {
      console.warn("[generateInvoiceHTML] ⚠️ Could not fetch or convert logo:", err.message);
      logoHTML = ""; 
    }
  }

  // Helper to render logo section and top spacing
  const renderLogoSection = (html) => {
    if (html) return `<div style="margin-bottom:18px;">${html}</div>`;
    return ""; // no empty placeholder if no logo
  };

  // Chart for pro users only
  const chartHTML = !isFree && data.showChart
    ? `<div class="chart-container">
         <h2>${locale.breakdown || "Breakdown"}</h2>
         <img src="https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify({
            type: "pie",
            data: {
              labels: ["Subtotal", "Tax"],
              datasets: [{ data: [
                Number(String(data.subtotal).replace(/[^\d.-]/g, "")) || 0,
                Number(String(data.tax).replace(/[^\d.-]/g, "")) || 0
              ]}]
            }
         }))}" alt="Invoice Breakdown" style="max-width:500px;display:block;margin:auto;" />
       </div>` : "";

  // Watermark for free/preview users
  const watermarkHTML = isFree && data.isPreview
    ? `<div class="watermark">${locale.watermarkBasic || 'FOR PRODUCTION ONLY — NOT AVAILABLE IN BASIC VERSION'}</div>` : "";

  // Full HTML
  return `
<html>
<head>
<meta charset="utf-8"/>
<style>
html, body { margin:0; padding:0; font-family:Arial,sans-serif; background:#fff; color:#000; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.container { max-width:800px; margin:20px auto; padding:30px 24px 60px; background:#fff; border-radius:8px; border:1px solid ${borderColor}; }
.table { width:100%; border-collapse:collapse; margin-bottom:20px; }
.table th, .table td { padding:10px; border:1px solid ${borderColor}; text-align:left; }
.table th { background-color:${secondaryColor}; color:${primaryColor}; font-weight:600; }
.table td { background-color:#fff; color:${primaryColor}; }
.table tr:nth-child(even) td { background-color:${evenRowColor}; }
.table tfoot td { background-color:${secondaryColor}; font-weight:bold; color:${primaryColor}; }
.total p { font-weight:bold; color:#000; font-size:1.05em; }
.watermark { position: fixed; top:40%; left:50%; transform:translate(-50%,-50%) rotate(-45deg); font-size:44px; color:rgba(255,204,204,0.8); font-weight:900; pointer-events:none; user-select:none; z-index:99; }
.footer { max-width:800px; margin:40px auto 10px auto; padding:10px; font-size:11px; border-top:1px solid ${borderColor}; text-align:center; color:${primaryColor}; }
</style>
</head>
<body>
<div class="container">
  ${renderLogoSection(logoHTML)}
  <h1>${locale.invoiceTitle || "Invoice for"} ${data.customerName || ""}</h1>

  <div class="invoice-header" style="display:flex; justify-content:space-between; gap:12px; margin-bottom:18px;">
    <div style="flex:1;">
      <p><strong>${locale.orderId || "Order ID"}:</strong> ${data.orderId}</p>
      <p><strong>${locale.date || "Date"}:</strong> ${data.date}</p>
      ${data.paymentTerms ? `<p><strong>${locale.paymentTerms}:</strong> ${data.paymentTerms}</p>` : ""}
      ${data.iban ? `<p><strong>IBAN:</strong> ${data.iban}</p>` : ""}
      ${data.bic ? `<p><strong>BIC:</strong> ${data.bic}</p>` : ""}
    </div>
    <div style="flex:1; text-align:right;">
      <p><strong>${locale.customer || "Customer"}:</strong><br>${data.customerName}</p>
      <p><strong>${locale.email || "Email"}:</strong><br><a href="mailto:${data.customerEmail}">${data.customerEmail}</a></p>
    </div>
  </div>

  <table class="table">
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
      ${items.length ? items.map(i => `<tr>
        <td>${i.position}</td>
        <td>${i.name}</td>
        <td>${i.quantity}</td>
        <td>${i.priceFormatted}</td>
        <td>${i.totalFormatted}</td>
        <td>${i.taxFormatted}</td>
        <td>${i.totalFormatted}</td>
      </tr>`).join("") : `<tr><td colspan="7">${locale.noItemsAvailable || "No items available"}</td></tr>`}
    </tbody>
    <tfoot>
      <tr><td colspan="6">${locale.subtotal || "Subtotal"}</td><td>${data.subtotalFormatted}</td></tr>
      <tr><td colspan="6">${locale.taxLabel || "Tax"} (${data.taxFormatted})</td><td>${data.taxFormatted}</td></tr>
      <tr><td colspan="6">${locale.total || "Total"}</td><td>${data.totalFormatted}</td></tr>
    </tfoot>
  </table>

  <div class="total"><p>${locale.totalAmountDue || "Total Amount Due"}: ${data.totalFormatted}</p></div>
  ${chartHTML}
</div>

${watermarkHTML}

<div class="footer">
  <p>${locale.thanks}</p>
  <p>${locale.contact} <a href="mailto:pdfifyapi@gmail.com">pdfifyapi@gmail.com</a>.</p>
  <p>© 2025 🧾PDFify — ${locale.copyright}</p>
  <p>${locale.generated} <a href="https://pdfify.pro" target="_blank">${locale.visitSite}</a></p>
</div>

</body>
</html>
  `;
}

module.exports = { generateInvoiceHTML };
