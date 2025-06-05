const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');
const ShopConfig = require('../models/ShopConfig');

router.post('/invoice', async (req, res) => {
  try {
    const data = req.body;

    const shopDomain = data.shopDomain || ''; // Required for shop-specific config

    const shopConfig = await ShopConfig.findOne({ shopDomain });

    if (!shopConfig) {
      return res.status(404).send('Shop config not found');
    }
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Invoice</title>
      <style>
       

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
          border: 1px solid #e0e4ec;
        }

        .logo {
          width: 150px;
          margin-bottom: 20px;
        }

        .logo:empty {
          display: none;
        }

        h1 {
          font-family: 'Playfair Display', serif;
          font-size: 32px;
          color: #2a3d66;
          text-align: center;
          margin: 20px 0;
        }

        .invoice-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #4a69bd;
          padding-bottom: 20px;
          margin-bottom: 30px;
        }

        .invoice-header .left,
        .invoice-header .right {
          font-size: 16px;
          line-height: 1.6;
        }

        .invoice-header .right {
          text-align: right;
          color: #777;
        }

        .table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }

        .table th,
        .table td {
          padding: 14px;
          border: 1px solid #dee2ef;
          text-align: left;
        }

        .table th {
          background-color: #dbe7ff;
          color: #2a3d66;
          font-weight: 600;
        }

        .table td {
          color: #444;
          background-color: #fdfdff;
        }

        .table tr:nth-child(even) td {
          background-color: #f6f9fe;
        }

        .table tfoot td {
          background-color: #dbe7ff;
          font-weight: bold;
        }

        .total {
          text-align: right;
          font-size: 20px;
          font-weight: bold;
          color: #2a3d66;
          margin-top: 10px;
        }

        .chart-container {
          text-align: center;
          margin-top: 40px;
          padding: 20px;
          background-color: #fdfdff;
          border: 1px solid #e0e4ec;
          border-radius: 12px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.05);
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .chart-container h2 {
          font-size: 20px;
          color: #2a3d66;
          margin-bottom: 20px;
        }

        .footer {
          max-width: 800px;
          margin: 40px auto 10px auto;
          padding: 10px 20px;
          background-color: #f0f2f7;
          color: #555;
          border-top: 2px solid #cbd2e1;
          text-align: center;
          font-size: 11px;
          border-radius: 0 0 16px 16px;
        }

        .footer a {
          color: #4a69bd;
          text-decoration: none;
          word-break: break-word;
        }

        .footer a:hover {
          text-decoration: underline;
        }

        @media (max-width: 768px) {
          .container {
            padding: 20px;
            padding-bottom: 160px;
          }
          .invoice-header {
            flex-direction: column;
            text-align: left;
          }
          .invoice-header .right {
            text-align: left;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        ${shopConfig?.customLogoUrl ? `<img src="${shopConfig.customLogoUrl}" class="logo" alt="Logo" />` : ''}
        <h1>Invoice for ${data.customerName}</h1>
        <div class="invoice-header">
          <div class="left">
            <p><strong>Order ID:</strong> ${data.orderId}</p>
            <p><strong>Date:</strong> ${data.date}</p>
          </div>
          <div class="right">
            <p><strong>Customer:</strong><br>${data.customerName}</p>
            <p><strong>Email:</strong><br><a href="mailto:${data.customerEmail}">${data.customerEmail}</a></p>
          </div>
        </div>

        <table class="table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${
              Array.isArray(data.items)
                ? data.items.map(item => `
                  <tr>
                    <td>${item.name || ''}</td>
                    <td>${item.quantity || ''}</td>
                    <td>${item.price || ''}</td>
                    <td>${item.total || ''}</td>
                  </tr>
                `).join('')
                : `<tr><td colspan="4">No items found</td></tr>`
            }
          </tbody>
          <tfoot>
            <tr><td colspan="3">Subtotal</td><td>${data.subtotal}</td></tr>
            <tr><td colspan="3">Tax</td><td>${data.tax}</td></tr>
            <tr><td colspan="3">Total</td><td>${data.total}</td></tr>
          </tfoot>
        </table>

        <div class="total">
          Total Due: ${data.total}
        </div>

        ${shopConfig?.showChart ? `
          <div class="chart-container">
            <h2>Invoice Breakdown</h2>
            <img src="https://quickchart.io/chart?c={
              type:'pie',
              data:{labels:['Subtotal','Tax'],datasets:[{data:[${data.subtotal.replace('€','')},${data.tax.replace('€','')}]}
              ]}
            }" style="max-width:500px;margin:auto;" />
          </div>
        ` : ''}
      </div>

      <div class="footer">
        <p>&copy; 2025 PDFify — All rights reserved.</p>
        <p>Need help? <a href="mailto:supportpdfifyapi@gmail.com">supportpdfifyapi@gmail.com</a></p>
        <p>
          Generated via <strong>PDFify</strong>. Visit 
          <a href="https://pdf-api.portfolio.lidija-jokic.com" target="_blank">our site</a> for more.
        </p>
      </div>
    </body>
    </html>
    `;

  


    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  
      
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename=invoice.pdf',
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Invoice generation error:', err);
    res.status(500).send('Failed to generate invoice');
  }
});

module.exports = router;
