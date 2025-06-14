function generateInvoiceHtml(data) {
  const logoUrl =
    typeof data.customLogoUrl === "string" && data.customLogoUrl.trim().length > 0
      ? data.customLogoUrl.trim()
      : "https://pdf-api.portfolio.lidija-jokic.com/images/Logo.png";

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

      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 30px;
      }

      .logo {
        max-width: 180px;
        height: auto;
      }

      h1 {
        color: #1565c0;
        border-bottom: 3px solid #42a5f5;
        padding-bottom: 10px;
        margin-top: 0;
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

      .footer {
        font-size: 11px !important;
        background-color: #f9f9f9;
        color: #444;
        border-top: 1px solid #ccc;
        text-align: center;
        line-height: 1.6;
        padding: 20px 10px;
        margin-top: auto;
        page-break-inside: avoid;
      }

      .footer a {
        color: #0073e6;
        text-decoration: none;
      }

      .footer a:hover {
        text-decoration: underline;
      }

      .footer p {
        margin: 6px 0;
        font-size: 11px !important;
        line-height: 1.5;
      }

      @media screen and (max-width: 600px) {
        body {
          padding: 20px;
        }

        .header {
          flex-direction: column;
          align-items: flex-start;
        }

        .logo {
          max-width: 140px;
          margin-bottom: 10px;
        }

        h1 {
          font-size: 1.6rem;
        }

        .section-title {
          font-size: 18px;
        }

        p {
          font-size: 15px;
        }

        th, td {
          padding: 8px;
          font-size: 14px;
        }

        table {
          min-width: 100%;
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
      ${logoUrl ? `<img src="${logoUrl}" alt="Company Logo" class="logo">` : ''}
      ${data.includeTitle ? `<h1>Invoice for ${data.customerName}</h1>` : ''}
    </div>

    <p><strong>Date:</strong> ${data.date}</p>
    <p><strong>Invoice Number:</strong> ${data.invoiceNumber || 'N/A'}</p>

    <div class="section-title">Items</div>
    <div class="table-wrapper">
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
    </div>

    ${data.notes ? `<p><strong>Notes:</strong> ${data.notes}</p>` : ''}

    <div class="footer">
      <p>Thanks for using our service!</p>
      <p>If you have questions, contact us at <a href="mailto:supportpdfifyapi@gmail.com">supportpdfifyapi@gmail.com</a>.</p>
      <p>&copy; 2025 🧾PDFify — All rights reserved.</p> 
      <p>
        Generated using <strong>PDFify</strong>. Visit 
        <a href="https://pdf-api.portfolio.lidija-jokic.com/" target="_blank">our site</a> for more.
      </p>
    </div>
  </body>
  </html>
  `;
}

module.exports = generateInvoiceHtml;
