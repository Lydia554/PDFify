



function generateInvoicePremiumHtml(data) {
  console.log('generateInvoicePremiumHtml data:', data);
  const {
    customerName = 'Valued Customer',
    recipientAddress = '',
    date = '',
    invoiceNumber = '',
    companyName = 'Your Company Name',
    companyAddress = '123 Business Rd, City',
    companyEmail = 'info@company.com',
    senderAddress = '',
    includeTitle = true,
    items = [],
    subtotal = 0,
    taxRate = 0,
    taxAmount = 0,
    total = 0,
    notes = '',
    logo = '',
  } = data;


  let itemsArray;
  if (typeof items === 'string') {
    itemsArray = items.split('\n').map(line => {
      const [description, quantity, unitPrice] = line.split(',');
      return {
        description: description?.trim() || '',
        quantity: Number(quantity) || 0,
        unitPrice: Number(unitPrice) || 0
      };
    });
  } else {
    itemsArray = items;
  }

  const renderItems = itemsArray.length
    ? itemsArray.map(item => `
      <tr>
        <td>${item.description || ''}</td>
        <td>${item.quantity || 0}</td>
        <td>${typeof item.unitPrice === 'number' ? item.unitPrice.toFixed(2) : '0.00'}</td>
        <td>${(Number(item.quantity) * Number(item.unitPrice) || 0).toFixed(2)}</td>
      </tr>
    `).join('')
    : `<tr><td colspan="4" style="text-align:center;">No items</td></tr>`;

  return `
 

    <html>
    <head>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap');
        body {
          font-family: 'Roboto', sans-serif;
          padding: 40px;
          color: #333;
          background: #f4f7fa;
        }
  
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 4px solid #1565c0;
          padding-bottom: 10px;
          margin-bottom: 30px;
        }
  
      
  
        .invoice-title {
          font-size: 28px;
          color: #1565c0;
          font-weight: bold;
        }
  
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 30px;
        }
  
        .info-box {
          background: #ffffff;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.05);
        }
  
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
          background: white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.05);
        }
  
        th, td {
          border: 1px solid #e0e0e0;
          padding: 12px;
          font-size: 15px;
        }
  
        th {
          background-color: #e3f2fd;
          text-align: left;
        }
  
        tfoot td {
          font-weight: bold;
          background: #f1faff;
          border-top: 2px solid #1565c0;
        }
  
        .notes {
          margin-top: 30px;
          font-size: 14px;
          color: #555;
        }
  
       .footer {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 20px;
    font-size: 12px;
    background-color: #f9f9f9;
    color: #444;
    border-top: 1px solid #ccc;
    text-align: center;
    line-height: 1.6;
  }
  .footer a {
    color: #0073e6;
    text-decoration: none;
  }
  .footer a:hover {
    text-decoration: underline;
  }
  
        @media screen and (max-width: 600px) {
          .info-grid {
            grid-template-columns: 1fr;
          }
  
          body {
            padding: 20px;
          }
  
          .invoice-title {
            font-size: 22px;
          }
  
          th, td {
            font-size: 14px;
          }

          
        .footer {
      font-size: 11px;
      padding: 15px 10px;
      line-height: 1.4;
    }

    .footer p {
      margin: 6px 0;
    }

    .footer a {
      word-break: break-word;
    }
        }
      </style>
    </head>
    <body>
      <div class="header">
       ${logo ? `<img src="${logo}" alt="Company Logo" class="logo" style="max-height: 60px; max-width: 200px;" />` : ''}
        ${includeTitle ? `<div class="invoice-title">Invoice</div>` : ''}
       

      </div>
  
      <div class="info-grid">
        <div class="info-box">
          <p><strong>Customer:</strong> ${customerName}</p>
          ${recipientAddress ? `<p><strong>Address:</strong> ${recipientAddress}</p>` : ''}
          <p><strong>Date:</strong> ${date}</p>
          <p><strong>Invoice #:</strong> ${invoiceNumber}</p>
        </div>
        <div class="info-box">
          <p><strong>Company:</strong> ${companyName}</p>
          <p><strong>Address:</strong> ${senderAddress || companyAddress}</p>
          <p><strong>Email:</strong> ${companyEmail}</p>
        </div>
      </div>
  
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Unit Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${renderItems}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="text-align:right;">Subtotal:</td>
            <td>${Number(subtotal).toFixed(2)}</td>
          </tr>
          <tr>
            <td colspan="3" style="text-align:right;">Tax (${Number(taxRate).toFixed(2)} %):</td>
            <td>${Number(taxAmount).toFixed(2)}</td>
          </tr>
          <tr>
            <td colspan="3" style="text-align:right;">Total:</td>
            <td>${Number(total).toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
  
      ${notes ? `<div class="notes"><strong>Notes:</strong> ${notes}</div>` : ''}
  
         <div class="footer">
  <p>Thanks for using our service!</p>
  <p>If you have questions, contact us at <a href="mailto:supportpdfifyapi@gmail.com">supportpdfifyapi@gmail.com</a>.</p>
  <p>&copy; 2025 🧾PDFify — All rights reserved.</p> 
  <p>
    Generated using <strong>PDFify</strong>. Visit 
    <a href="https://pdfify.pro//" target="_blank">our site</a> for more.
  </p>
</div>
    </body>
    </html>
    `;
  }
  
  module.exports = generateInvoicePremiumHtml;
  