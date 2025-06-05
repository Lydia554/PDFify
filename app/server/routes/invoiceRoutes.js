const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const router = express.Router();
const fs = require("fs");
const authenticate = require("../middleware/authenticate");
const User = require("../models/User");
const pdfParse = require("pdf-parse");

const log = (message, data = null) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(message, data);
  }
};


function generateInvoiceHTML(data) {
  const items = Array.isArray(data.items) ? data.items : [];

  const logoUrl =
  typeof data.customLogoUrl === "string" && data.customLogoUrl.trim().length > 0
    ? data.customLogoUrl.trim()
    : "https://pdf-api.portfolio.lidija-jokic.com/images/Logo.png";


return `
<html>
  <head>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap');
      @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&display=swap');

      body {
        font-family: 'Open Sans', sans-serif;
        color: #333;
        background: #f4f7fb;
        margin: 0;
        padding: 0;
        min-height: 100vh;
        position: relative;
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
        letter-spacing: 1px;
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
        margin-bottom: 105x;
      }

      @media (max-width: 768px) {
        .container {
          margin: 20px auto;
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

        h1 {
          font-size: 24px;
        }

        .total {
          font-size: 18px;
        }

        .chart-container h2 {
          font-size: 16px;
        }
      }

      .footer {
        position: static;
        max-width: 800px;
        margin: 40px auto 10px auto;
        padding: 10px 20px;
        background-color: #f0f2f7;
        color: #555;
        border-top: 2px solid #cbd2e1;
        text-align: center;
        line-height: 1.6;
        font-size: 11px;
        border-radius: 0 0 16px 16px;
        box-sizing: border-box;
       
      }

      .footer p {
        margin: 6px 0;
      }

      .footer a {
        color: #4a69bd;
        text-decoration: none;
        word-break: break-word;
      }

      .footer a:hover {
        text-decoration: underline;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <img src="${logoUrl}" alt="Logo" style="height: 60px;" />

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
          ${
            Array.isArray(items)
              ? items.map(item => `
                  <tr>
                    <td>${item.name || ''}</td>
                    <td>${item.quantity || ''}</td>
                    <td>${item.price || ''}</td>
                    <td>${item.total || ''}</td>
                  </tr>
                `).join('')
              : `<tr><td colspan="4">No items available</td></tr>`
          }
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

      ${data.showChart ? `
        <div class="chart-container">
          <h2>Breakdown</h2>
          <img src="https://quickchart.io/chart?c={
            type:'pie',
            data:{labels:['Subtotal','Tax'],datasets:[{data:[${data.subtotal.replace('€','')},${data.tax.replace('€','')}]}
            ]}
          }" alt="Invoice Breakdown" style="max-width:500px;display:block;margin:auto;" />
        </div>
      ` : ''}
    </div>

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



router.post("/generate-invoice", authenticate, async (req, res) => {
  try {
    let { data, isPreview } = req.body;
    if (!data || typeof data !== "object") {
      return res.status(400).json({ error: "Invalid or missing data" });
    }

    let invoiceData = { ...data }; 
   
    if (typeof invoiceData.items === "string") {
      try {
        invoiceData.items = JSON.parse(invoiceData.items);
      } catch (err) { 
        invoiceData.items = [];
      }
    }
    

    if (!Array.isArray(invoiceData.items)) {
      invoiceData.items = [];
    }
 
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }


    // Force premium for test
user.isPremium = true;

    if (!user.isPremium) {
      invoiceData.customLogoUrl = null;
      invoiceData.showChart = false;
    }

   
    const safeOrderId = invoiceData.orderId || `preview-${Date.now()}`;

    const pdfDir = path.join(__dirname, "../pdfs");
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const pdfPath = path.join(pdfDir, `Invoice_${safeOrderId}.pdf`);
   
 
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();

    const html = generateInvoiceHTML(invoiceData);

    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({ path: pdfPath, format: "A4" });
    await browser.close();


    const pdfBuffer = fs.readFileSync(pdfPath);
    const parsed = await pdfParse(pdfBuffer);
    const pageCount = parsed.numpages;
  
    if (!isPreview) {
  
      if (user.usageCount + pageCount > user.maxUsage) {
        fs.unlinkSync(pdfPath);
        
        return res.status(403).json({
          error: "Monthly usage limit reached. Upgrade to premium for more pages.",
        });
      }

      user.usageCount += pageCount;
      await user.save();
    } else {
      
     }


    res.download(pdfPath, (err) => {
      if (err) {
      } else {
      }
      fs.unlinkSync(pdfPath);
    });
  } catch (error) {
    res.status(500).json({ error: "PDF generation failed" });
  }
});



module.exports = router;
