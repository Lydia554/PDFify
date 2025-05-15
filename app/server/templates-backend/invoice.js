
const { formatDate, calculateTotal } = require('../../shared/shared.js');


module.exports = {
  friendlyFieldsHtml: `
    <label>Invoice Number:</label>
    <input type="text" id="invoiceNumber" required /><br />

    <label>Customer Name:</label>
    <input type="text" id="customerName" required /><br />

    <label>Amount:</label>
    <input type="number" id="amount" required /><br />

    <label>Due Date:</label>
    <input type="date" id="dueDate" required /><br />
  `,
  collectFriendlyData: () => {
    return {
      invoiceNumber: document.getElementById('invoiceNumber')?.value || '',
      customerName: document.getElementById('customerName')?.value || '',
      amount: document.getElementById('amount')?.value || '',
      dueDate: document.getElementById('dueDate')?.value || '',
    };
  }
};
