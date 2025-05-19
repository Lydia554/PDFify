function generateInvoiceHtml(data) {
  return `
  <html>
  <head>
    <style>
      body {
        font-family: 'Arial', sans-serif;
        padding: 30px;
        color: #444;
        background: #fff;
      }
      h1 {
        color: #1565c0;
        border-bottom: 3px solid #42a5f5;
        padding-bottom: 10px;
      }
      p {
        font-size: 16px;
        line-height: 1.5;
        margin: 4px 0;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 20px;
      }
      th, td {
        border: 1px solid #ccc;
        padding: 10px;
        text-align: left;
      }
      th {
        background-color: #e3f2fd;
      }
      tfoot td {
        font-weight: bold;
        border-top: 2px solid #1565c0;
      }
      .section-title {
        font-size: 22px;
        color: #1565c0;
        margin-top: 30px;
        margin-bottom: 10px;
        font-weight: bold;
        border-bottom: 2px solid #42a5f5;
        padding-bottom: 4px;
      }
    </style>
  </head>
  <body>
    ${data.includeTitle ? `<h1>Invoice for ${data.customerName}</h1>` : ''}
    
    <p><strong>Date:</strong> ${data.date}</p>
    <p><strong>Invoice Number:</strong> ${data.invoiceNumber || 'N/A'}</p>

    <div class="section-title">Items</div>
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th>Quantity</th>
          <th>Unit Price</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${data.items && data.items.length > 0
          ? data.items.map(item => `
            <tr>
              <td>${item.description}</td>
              <td>${item.quantity}</td>
              <td>${typeof item.unitPrice === 'number' ? item.unitPrice.toFixed(2) : '0.00'}</td>
<td>${(Number(item.quantity) * Number(item.unitPrice) || 0).toFixed(2)}</td>

            </tr>
          `).join('')
          : `<tr><td colspan="4" style="text-align:center;">No items</td></tr>`
        }
      </tbody>
    <tfoot>
  <tr>
    <td colspan="3" style="text-align:right;">Subtotal:</td>
    <td>${(Number(data.subtotal) || 0).toFixed(2)}</td>
  </tr>
  <tr>
    <td colspan="3" style="text-align:right;">Tax (${Number(data.taxRate) || 0} %):</td>
    <td>${(Number(data.taxAmount) || 0).toFixed(2)}</td>
  </tr>
  <tr>
    <td colspan="3" style="text-align:right;">Total:</td>
    <td>${(Number(data.total) || 0).toFixed(2)}</td>
  </tr>
</tfoot>

    </table>

    ${data.notes ? `<p><strong>Notes:</strong> ${data.notes}</p>` : ''}
  </body>
  </html>
  `;
}

module.exports = generateInvoiceHtml;
