const { formatDate } = require('../shared');

function generateInvoiceHtml(data) {
  return `
    <h1>Invoice for ${data.customerName}</h1>
    <p>Date: ${formatDate(data.date)}</p>
    <p>Total: $${data.amount}</p>
  `;
}

module.exports = generateInvoiceHtml;
