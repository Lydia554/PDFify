const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const router = express.Router();
const fs = require("fs");
const authenticate = require("../middleware/authenticate");
const User = require("../models/User");


const log = (message, data = null) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(message, data);
  }
};


function generateInvoiceHTML(data) {
  return `
    <html>
      <head>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap');

          body {
            font-family: 'Open Sans', sans-serif;
            color: #333;
            background: #f4f7fb;
            margin: 0;
            padding: 0;
          }

          .container {
            max-width: 800px;
            margin: 50px auto;
            padding: 30px 40px;
            background-color: #fff;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
            border-radius: 12px;
            position: relative;
          }

          .logo {
            width: 150px;
            margin-bottom: 20px;
          }

          h1 {
            font-size: 28px;
            color: #2a3d66;
            text-align: center;
            margin: 20px 0;
            letter-spacing: 1px;
          }

          .invoice-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #2a3d66;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }

          .invoice-header .left,
          .invoice-header .right {
            font-size: 16px;
            line-height: 1.5;
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
            padding: 12px;
            border: 1px solid #ddd;
            text-align: left;
          }

          .table th {
            background-color: #eaf0fb;
            color: #2a3d66;
            font-weight: 600;
          }

          .table td {
            color: #444;
          }

          .table tr:nth-child(even) td {
            background-color: #f9fbff;
          }

          .table tfoot td {
            background-color: #eaf0fb;
            font-weight: bold;
          }

          .total {
            text-align: right;
            font-size: 18px;
            font-weight: bold;
            color: #2a3d66;
            margin-top: 10px;
          }

          .chart-container {
            text-align: center;
            margin: 40px 0 20px;
          }

          .chart-container h2 {
            font-size: 18px;
            color: #2a3d66;
            margin-bottom: 10px;
          }

          .footer {
            text-align: center;
            margin-top: 40px;
            font-size: 14px;
            color: #777;
            border-top: 1px dashed #ccc;
            padding-top: 20px;
          }

          .footer a {
            color: #2a3d66;
            text-decoration: none;
          }

          .footer a:hover {
            text-decoration: underline;
          }

          .terms {
            margin-top: 15px;
            font-size: 12px;
            color: #aaa;
          }
        </style>
      </head>
      <body>
        <div class="container">
       <img src="${process.env.baseUrl}/images/Logo.png" alt="Company Logo" class="logo" />

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
                <th>Quantity</th>
                <th>Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${data.items.map(item => `
                <tr>
                  <td>${item.name}</td>
                  <td>${item.quantity}</td>
                  <td>${item.price}</td>
                  <td>${item.total}</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3">Subtotal</td>
                <td>${data.subtotal}</td>
              </tr>
              <tr>
                <td colspan="3">Tax (21%)</td>
                <td>${data.tax}</td>
              </tr>
              <tr>
                <td colspan="3">Total</td>
                <td>${data.total}</td>
              </tr>
            </tfoot>
          </table>

          <div class="total">
            <p>Total Amount Due: ${data.total}</p>
          </div>

          <div class="chart-container">
            <h2>Breakdown</h2>
            <img src="https://quickchart.io/chart?c={
              type:'pie',
              data:{labels:['Subtotal','Tax'],datasets:[{data:[${data.subtotal.replace('€','')},${data.tax.replace('€','')}]}
              ]}
            }" alt="Invoice Breakdown" style="max-width:300px;display:block;margin:auto;" />
          </div>

          <div class="footer">
            <p>Thank you for your business!</p>
            <p>If you have questions, contact us at <a href="mailto:support@pdfgeneratorapp.gmail.com">support@pdfgeneratorapp.gmail.com</a>.</p>
            <p>&copy; 2025 TetaFit Store — All rights reserved.</p>
            <p class="terms">
              Terms & Conditions: Payment due within 14 days. Late payments may result in additional fees. Refer to our website for full terms.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
}



router.post("/generate-invoice", authenticate, async (req, res) => {
  const { data } = req.body;

  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.usageCount >= user.maxUsage) {
      return res.status(403).json({ error: "Monthly usage limit reached. Upgrade to premium for unlimited access." });
    }

    user.usageCount += 1;
    await user.save();

  
    const pdfDir = path.join(__dirname, "../pdfs");
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const pdfPath = path.join(pdfDir, `Invoice_${data.orderId}.pdf`);


    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    const html = generateInvoiceHTML(data);
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({ path: pdfPath, format: "A4" });
    await browser.close();

    res.download(pdfPath, (err) => {
      if (err) {
        console.error("Error sending file:", err);
      }
      fs.unlinkSync(pdfPath); 
    });

  } catch (error) {
    console.error("Error during PDF generation:", error);
    res.status(500).json({ error: "PDF generation failed" });
  }
});


module.exports = router;