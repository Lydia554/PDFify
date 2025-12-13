
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
  orderId
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

  // The new, professional premium template
  const premiumTemplate = `
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>Invoice</title>
      <style>
        :root {
          --font-family: 'Liberation Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          --primary-color: #0d1b2a; /* Deep Navy Blue */
          --secondary-color: #415a77; /* Shadow Blue */
          --accent-color: #1b998b; /* Muted Teal */
          --background-color: #f8f9fa;
          --text-color: #343a40;
          --light-gray: #e9ecef;
          --border-color: #dee2e6;
        }
        body {
          font-family: var(--font-family);
          color: var(--text-color);
          background: #fff;
          margin: 0;
          padding: 0;
          font-size: 14px;
        }
        .invoice-container {
          max-width: 800px;
          margin: 40px auto;
          padding: 40px;
          border: 1px solid var(--border-color);
          background: #fff;
        }
        .invoice-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding-bottom: 30px;
          border-bottom: 2px solid var(--primary-color);
          margin-bottom: 40px;
        }
        .logo {
          max-height: 80px;
          max-width: 200px;
        }
        .invoice-title-section {
          text-align: right;
        }
        .invoice-title {
          font-size: 36px;
          font-weight: 700;
          color: var(--primary-color);
          margin: 0 0 10px 0;
        }
        .invoice-meta p {
          margin: 0;
          line-height: 1.5;
          font-size: 14px;
          color: var(--secondary-color);
        }
        .invoice-meta p strong {
          color: var(--primary-color);
        }
        .parties-section {
          display: flex;
          justify-content: space-between;
          margin-bottom: 40px;
        }
        .party {
          width: 48%;
        }
        .party h3 {
          font-size: 16px;
          font-weight: 700;
          color: var(--secondary-color);
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 8px;
          margin: 0 0 8px 0;
        }
        .party p {
          margin: 0;
          line-height: 1.6;
        }
        .invoice-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        .invoice-table thead {
          background-color: var(--primary-color);
          color: #fff;
        }
        .invoice-table th {
          font-weight: 700;
          padding: 15px;
          text-align: left;
        }
        .invoice-table td {
          padding: 15px;
          border-bottom: 1px solid var(--border-color);
        }
        .invoice-table tbody tr:nth-child(even) {
          background-color: var(--background-color);
        }
        .invoice-table .text-right {
          text-align: right;
        }
        .product-image {
          width: 50px;
          height: 50px;
          object-fit: cover;
          border-radius: 4px;
          background: white;
        }
        .totals-section {
          display: flex;
          justify-content: flex-end;
        }
        .totals-table {
          width: 50%;
          max-width: 350px;
        }
        .totals-table td {
          padding: 12px 15px;
        }
        .totals-table .label {
          font-weight: 700;
          color: var(--secondary-color);
        }
        .totals-table .amount {
          text-align: right;
        }
        .amount-due-row .label, .amount-due-row .amount {
          font-size: 1.2em;
          font-weight: 700;
          color: var(--accent-color);
          border-top: 2px solid var(--accent-color);
          padding-top: 15px;
        }
        .footer {
          border-top: 1px solid var(--border-color);
          padding-top: 20px;
          margin-top: 40px;
          text-align: center;
          font-size: 12px;
          color: #888;
        }
      </style>
    </head>
    <body>
      <div class="invoice-container">
        <header class="invoice-header">
          <div>
            ${customLogoUrl ? `<img src="${customLogoUrl}" alt="Company Logo" class="logo">` : `<h1>${shopName}</h1>`}
          </div>
          <div class="invoice-title-section">
            <p class="invoice-title">${t.invoiceTitle || "INVOICE"}</p>
            <div class="invoice-meta">
              <p><strong>${t.orderId || "Invoice #"}:</strong> ${orderId || ""}</p>
              <p><strong>${t.date || "Date"}:</strong> ${date || ""}</p>
            </div>
          </div>
        </header>

        <section class="parties-section">
          <div class="party">
            <h3>${t.from || "From"}</h3>
            <p><strong>${shopName}</strong></p>
          </div>
          <div class="party">
            <h3>${t.to || "To"}</h3>
            <p><strong>${customerName}</strong></p>
            <p>${billingAddress}</p>
          </div>
        </section>

        <table class="invoice-table">
          <thead>
            <tr>
              <th>${t.item || "Item"}</th>
              <th class="text-right">${t.quantity || "Quantity"}</th>
              <th class="text-right">${t.price || "Price"}</th>
              <th class="text-right">${t.total || "Total"}</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td>${item.name || ""}</td>
                <td class="text-right">${item.quantity}</td>
                <td class="text-right">${item.formattedPrice}</td>
                <td class="text-right">${item.formattedTotal}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>

        <section class="totals-section">
          <table class="totals-table">
            <tbody>
              <tr>
                <td class="label">${t.subtotal || "Subtotal"}</td>
                <td class="amount">${formattedSubtotal}</td>
              </tr>
              <tr>
                <td class="label">${t.taxTotal || "Tax"}</td>
                <td class="amount">${formattedTaxTotal}</td>
              </tr>
              <tr class="amount-due-row">
                <td class="label">${t.totalGross || "Total Due"}</td>
                <td class="amount">${formattedTotal}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <footer class="footer">
          <p>${t.footerNote || "Thank you for your business!"}</p>
          <p><a href="https://pdfify.pro/">${t.visitSite || "pdfify.pro"}</a></p>
        </footer>
      </div>
    </body>
    </html>
  `;

  return isPremium ? premiumTemplate : basicTemplate;

}



module.exports = { generateCustomerInvoiceHTML, formatPrice };