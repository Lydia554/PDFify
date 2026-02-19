
function formatPrice(amount, currency = "EUR", locale = "de-DE") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
}


function generateCustomerInvoiceHTML(invoiceData, isPremium, lang, t) {

const {
  shopName,
  date,
  items,
  formattedSubtotal,
  formattedTaxTotal,
  formattedTotal,
  showChart,
  customLogoUrl,
  fallbackLogoUrl,
  customerName,
  shippingAddress,
  billingAddress,
} = invoiceData;

  const basicTemplate = `
    <html>
      <head><meta charset="UTF-8" /><title>Invoice</title></head>
      <body style="font-family: sans-serif;">
        <h1>Invoice</h1>
        <p><strong>From:</strong> ${shopName}</p>
        <p><strong>Date:</strong> ${date}</p>
        <table border="1" cellpadding="10" cellspacing="0" width="100%">
          <thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td>${item.name}</td>
                <td>${item.quantity}</td>
                <td>$${item.price.toFixed(2)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <h3>Total: ${formattedTotal}
</h3>
      </body>
    </html>
  `;

const premiumTemplate = `
  <html>
    <head>
      <meta charset="UTF-8" />
      <title>Invoice</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
          color: #1f2937;
          background: #ffffff;
          margin: 0;
          padding: 20px;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .container {
          max-width: 800px;
          margin: 0 auto;
          padding: 40px;
          background: #ffffff;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .logo {
          max-width: 180px;
          max-height: 80px;
          object-fit: contain;
          margin-bottom: 20px;
        }

        .accent-line {
          width: 100%;
          height: 3px;
          background: #2a3d66;
          margin-bottom: 30px;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 40px;
        }

        .invoice-title {
          font-size: 32px;
          font-weight: 700;
          color: #1f2937;
          margin: 0;
        }

        .invoice-details {
          text-align: right;
        }

        .invoice-details p {
          margin: 4px 0;
          font-size: 14px;
          color: #6b7280;
        }

        .invoice-details strong {
          color: #374151;
        }

        .customer-section {
          display: flex;
          gap: 30px;
          margin-bottom: 30px;
        }

        .customer-box {
          flex: 1;
          padding: 16px 20px;
          background: #f8fafc;
          border-left: 4px solid #2a3d66;
          border-radius: 4px;
        }

        .customer-box p {
          margin: 6px 0;
          font-size: 14px;
          color: #374151;
          line-height: 1.5;
        }

        .customer-box strong {
          color: #1f2937;
          font-weight: 600;
        }

        .table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }

        .table thead {
          background: #dbe7ff;
        }

        .table th {
          padding: 12px 16px;
          text-align: left;
          font-weight: 600;
          font-size: 13px;
          color: #2a3d66;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 2px solid #c5d0f9;
        }

        .table td {
          padding: 14px 16px;
          font-size: 14px;
          color: #374151;
          border-bottom: 1px solid #e5e7eb;
        }

        .table tbody tr:nth-child(even) {
          background: #f6f9fe;
        }

        .table tbody tr:hover {
          background: #f0f4ff;
        }

        .totals {
          display: flex;
          justify-content: flex-end;
        }

        .totals-box {
          width: 280px;
        }

        .total-line {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          font-size: 14px;
          color: #6b7280;
        }

        .total-line.grand-total {
          background: #2a3d66;
          color: #ffffff;
          padding: 12px 16px;
          border-radius: 6px;
          font-weight: 700;
          font-size: 16px;
          margin-top: 8px;
        }

        .footer {
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          text-align: center;
          font-size: 12px;
          color: #9ca3af;
        }

        .footer a {
          color: #2a3d66;
          text-decoration: none;
        }

        .footer a:hover {
          text-decoration: underline;
        }
      </style>
    </head>
    <body>
      <div class="container">
        ${customLogoUrl && customLogoUrl.trim() !== "" ? `<img src="${customLogoUrl}" class="logo" />` : ""}

        <div class="accent-line"></div>

        <div class="header">
          <h1 class="invoice-title">${t.invoiceTitle || "Invoice"}</h1>
          <div class="invoice-details">
            <p><strong>${t.invoiceNumber || "Invoice Number"}:</strong> ${invoiceData.orderId || ""}</p>
            <p><strong>${t.date || "Date"}:</strong> ${date}</p>
          </div>
        </div>

        <div class="customer-section">
          <div class="customer-box">
            <p><strong>${t.from || "From"}:</strong></p>
            <p>${shopName}</p>
          </div>
          <div class="customer-box">
            <p><strong>${t.customerName || "Customer"}:</strong></p>
            <p>${customerName}</p>
            ${shippingAddress ? `<p>${shippingAddress}</p>` : ""}
          </div>
        </div>

        <table class="table">
          <thead>
            <tr>
              <th>${t.item || "Item"}</th>
              <th>${t.quantity || "Quantity"}</th>
              <th>${t.price || "Price"}</th>
              <th>${t.total || "Total"}</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td>${item.name}</td>
                <td>${item.quantity}</td>
                <td>${item.formattedPrice}</td>
                <td>${item.formattedTotal || item.formattedPrice}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>

        <div class="totals">
          <div class="totals-box">
            <div class="total-line">
              <span>${t.subtotal || "Subtotal"}:</span>
              <span>${formattedSubtotal}</span>
            </div>
            <div class="total-line">
              <span>${t.taxTotal || "Tax"}:</span>
              <span>${formattedTaxTotal}</span>
            </div>
            <div class="total-line grand-total">
              <span>${t.totalGross || "Total"}:</span>
              <span>${formattedTotal}</span>
            </div>
          </div>
        </div>

        <div class="footer">
          <p>${t.footerNote || "Thank you for your business!"}</p>
          <p><a href="https://pdfify.pro/">${t.visitSite || "Powered by PDFify"}</a></p>
        </div>
      </div>
    </body>
  </html>
`;

  return isPremium ? premiumTemplate : basicTemplate;

}



module.exports = { generateCustomerInvoiceHTML, formatPrice };
