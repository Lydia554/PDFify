function generateInvoiceHTML(data) {
    return `
      <html>
        <body>
          <h1>Invoice for ${data.customerName}</h1>
          <p>Order ID: ${data.orderId}</p>
          <p>Total: ${data.total}</p>
          <!-- More invoice HTML -->
        </body>
      </html>
    `;
  }
  
  module.exports = generateInvoiceHTML;