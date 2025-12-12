
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
        @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&display=swap');

        body {
          font-family: 'Open Sans', sans-serif;
          color: #333;
          background: #f4f7fb;
          margin: 0;
          padding: 0;
        }

        .container {
          max-width: 800px;
          margin: 20px auto;
          padding: 30px 40px 160px;
          background: linear-gradient(to bottom right, #ffffff, #f8fbff);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.08);
          border-radius: 16px;
        }

        .logo {
          width: 150px;
          margin-bottom: 20px;
        }

        h1 {
          font-family: 'Playfair Display', serif;
          font-size: 32px;
          color: #04754aff;
          text-align: center;
        }

        .invoice-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 2px solid #04754aff;
        }


   
.summary {
  margin-top: 30px;
  clear: both;
  display: flex;
  justify-content: flex-end;
  width: 100%;
}

.summary-box {
  border-top: 2px solid #cbd2e1;
  padding-top: 15px;
  max-width: 400px;
  width: 100%;
  font-size: 1em;
  font-family: 'Open Sans', sans-serif;
  color: #95BF47;
}

.summary-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-weight: 600;
  color: #95BF47;
  letter-spacing: 0.02em;
}

.summary-line.total {
  font-size: 1.25em;
  border-top: 1px solid #a3aed8;
  padding-top: 12px;
  padding-bottom: 12px;
  margin-top: 14px;
  font-weight: 700;
  color: #04754aff;
  background: #e9f0ff;
  border-radius: 4px;
  padding-left: 10px;
  padding-right: 10px;
}


.customer-info {
  margin: 30px 0;
  padding: 20px 25px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(23, 177, 118, 0.15);
  font-family: 'Open Sans', sans-serif;
  color: #010201ff;
  font-size: 1em;
  line-height: 1.5;
  font-weight: 600;
  letter-spacing: 0.02em;
  transition: box-shadow 0.3s ease;
}

.customer-info:hover {
  box-shadow: 0 8px 24px rgba(4, 87, 18, 0.3);
}

.customer-info p {
  margin: 6px 0;
}


.shipping-info {
  background: linear-gradient(135deg, #e0ffe8 0%, #c8f7df 100%);
  border-left: 6px solid #04754aff; 
}


.billing-info {
  background: linear-gradient(135deg, #fffbe6 0%, #fff4c2 100%);
  border-left: 6px solid #95BF47;
}



.table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0 8px; /* vertical spacing between rows */
  font-family: 'Open Sans', sans-serif;
}

.table th,
.table td {
  padding: 14px 18px;
  border: none;
  background-color: #f7faff;
  vertical-align: middle;
  color: #036b32ff;
  box-shadow: inset 0 -1px 0 #95BF47;
  border-radius: 8px;
}

.table th {
  background-color: #dbe7ff;
  font-weight: 700;
  color: #04754aff;
  text-align: left;
}

.table tbody tr:hover td {
  background-color: #e6f0ff;
  cursor: default;
}


       

        .product-image {
          width: 60px;
          height: 60px;
          object-fit: contain;
          border-radius: 8px;
          border: 1px solid #ccc;
          background: white;
        }

    

        .chart-container {
          margin-top: 30px;
          text-align: center;
        }

        .footer {
          max-width: 800px;
          margin: 40px auto 10px auto;
          padding: 10px 20px;
          background-color: #f0f2f7;
          color: #555;
          text-align: center;
          font-size: 11px;
          border-top: 2px solid #cbd2e1;
          border-radius: 0 0 16px 16px;
          position: static;
        }
      </style>

      </head>
<body>
  <div class="container">
    <img src="${customLogoUrl || fallbackLogoUrl}" class="logo" />

    <h1>${t.invoiceTitle}</h1>

    <div class="invoice-header">
      <div><strong>${t.from}</strong><br>${shopName}</div>
      <div><strong>${t.date}</strong><br>${date}</div>
    </div>

 <!-- 👤 Customer Info -->
<div class="customer-info shipping-info">
  <p><strong>${t.customerName}:</strong> ${customerName}</p>
  <p><strong>${t.shippingAddress}:</strong> ${shippingAddress}</p>
</div>

<div class="customer-info billing-info">
  <p><strong>${t.billingAddress}:</strong> ${billingAddress}</p>
</div>


    <!-- 🛒 Item Table -->
    <table class="table">
      <thead>
        <tr>
          <th>${t.image}</th>
          <th>${t.item}</th>
          <th>${t.quantity}</th>
          <th>${t.price}</th>
          <th>${t.taxIncluded}</th>
        </tr>
      </thead>


      <tbody>
        ${items
          .map(
            (item) => `
            <tr>
              <td>${
                item.imageUrl
                  ? `<img src="${item.imageUrl}" class="product-image" />`
                  : ""
              }</td>
              <td>${item.name}</td>
              <td>${item.quantity}</td>
              <td>${item.formattedPrice}</td>
              <td>${t.taxIncluded}</td>
            </tr>
          `
          )
          .join("")}
      </tbody>
    </table>

    <!-- 💰 Summary Section -->
    <div class="summary">
      <div class="summary-box">
        <div class="summary-line"><span>${t.subtotal}:</span><span>${formattedSubtotal}</span></div>
        <div class="summary-line"><span>${t.taxTotal}:</span><span>${formattedTaxTotal}</span></div>
        <div class="summary-line total"><strong>${t.totalGross}:</strong><strong>${formattedTotal}</strong></div>
      </div>
    </div>



    ${
      showChart
        ? `<div class="chart-container"><h2>${t.spendingOverview}</h2><img src="https://via.placeholder.com/400x200?text=Chart" /></div>`
        : ""
    }
  </div>

  <div class="footer">
    <p>${t.footerNote}</p>
    <p><a href="https://pdfify.pro/">${t.visitSite}</a></p>
  </div>
</body>

    </html>
  `;

  return isPremium ? premiumTemplate : basicTemplate;

}



module.exports = { generateCustomerInvoiceHTML, formatPrice };