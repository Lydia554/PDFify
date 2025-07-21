const en = require('../../locales-friendly/en.json');
const de = require('../../locales-friendly/de.json');
const sl = require('../../locales-friendly/sl.json');

const locales = { en, de, sl };

function generateInvoicePremiumHtml(data) {
  console.log('generateInvoiceFriendlyHtml data:', data);
  const {
    customerName = 'Valued Customer',
    recipientAddress = '',
    date = '',
    invoiceNumber = '',
    companyName = 'Your Company Name',
    companyEmail = 'info@company.com',
    senderAddress = '',
    includeTitle = true,
    items = [],
    taxRate = 0,
    notes = '',
    logo = '',
    language = 'en',
  } = data;

  // Add this fallback:
const lang = language || data.invoiceLanguage || 'en';
const t = locales[lang] || locales['en'];


  let itemsArray;
  if (typeof items === 'string') {
    itemsArray = items.split('\n').map(line => {
      const [description, quantity, unitPrice, itemTaxRate] = line.split(',');
      return {
        description: description?.trim() || '',
        quantity: Number(quantity) || 0,
        unitPrice: Number(unitPrice) || 0,
        taxRate: itemTaxRate !== undefined ? Number(itemTaxRate) : undefined,
      };
    });
  } else {
    itemsArray = items;
  }



    const renderItems = itemsArray.length
    ? itemsArray.map(item => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unitPrice) || 0;
      const itemTotal = qty * price;

      // Use item-specific taxRate or fallback
      const itemTaxRate = Number(item.taxRate ?? taxRate) || 0;
      const itemTaxAmount = itemTotal * (itemTaxRate / 100);

      return `
      <tr>
        <td>${item.description || ''}</td>
        <td>${qty}</td>
        <td>${price.toFixed(2)}</td>
        <td>${itemTotal.toFixed(2)}</td>
        <td>${itemTaxAmount.toFixed(2)}</td>
      </tr>
      `;
    }).join('')
    : `<tr><td colspan="5" style="text-align:center;">${t.noItems || 'No items'}</td></tr>`;

  const computedSubtotal = itemsArray.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unitPrice) || 0;
    return sum + qty * price;
  }, 0);

  const computedTaxAmount = itemsArray.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unitPrice) || 0;
    const itemTaxRate = Number(item.taxRate ?? taxRate) || 0;
    return sum + qty * price * (itemTaxRate / 100);
  }, 0);

  const computedTotal = computedSubtotal + computedTaxAmount;

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
    position: static;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 20px;
    font-size: 11px;
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
    ${includeTitle ? `<div class="invoice-title">${t.invoice}</div>` : ''}
  </div>

  <div class="info-grid">
    <div class="info-box">
      <p><strong>${t.customer}:</strong> ${customerName}</p>
      ${recipientAddress ? `<p><strong>${t.recipientAddress}:</strong> ${recipientAddress}</p>` : ''}
      <p><strong>${t.date}:</strong> ${date}</p>
      <p><strong>${t.invoiceNumber}:</strong> ${invoiceNumber}</p>
    </div>
    <div class="info-box">
      <p><strong>${t.company}:</strong> ${companyName}</p>
      <p><strong>${t.senderAddress}:</strong> ${senderAddress}</p>
      <p><strong>${t.companyEmail}:</strong> ${companyEmail}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>${t.description}</th>
        <th>${t.qty}</th>
        <th>${t.unitPrice}</th>
        <th>${t.total}</th>
        <th>${t.tax}</th>
      </tr>
    </thead>
    <tbody>
      ${renderItems}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="4" style="text-align:right;">${t.subtotal}:</td>
        <td>${computedSubtotal.toFixed(2)}</td>
      </tr>
      <tr>
        <td colspan="4" style="text-align:right;">${t.tax} (${Number(taxRate).toFixed(2)} %):</td>
        <td>${computedTaxAmount.toFixed(2)}</td>
      </tr>
      <tr>
        <td colspan="4" style="text-align:right;">${t.total}:</td>
        <td>${computedTotal.toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>

  ${notes ? `<div class="notes"><strong>${t.notes}:</strong> ${notes}</div>` : ''}

  <div class="footer">
    <p>${t.thanks}</p>
    <p>${t.questions} <a href="mailto:pdfifyapi@gmail.com">pdfifyapi@gmail.com</a>.</p>
    <p>&copy; 2025 🧾PDFify — ${t.rights}</p>
    <p>
      ${t.generatedUsing} <strong>PDFify</strong>. Visit
        <a href="https://pdfify.pro/" target="_blank">our site</a> for more.
      </p>
  </div>
</body>
</html>
`;
}
  
  module.exports = generateInvoicePremiumHtml;
  