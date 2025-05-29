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
  const logoUrl = data.customLogoUrl || "https://pdf-api.portfolio.lidija-jokic.com/images/Logo.png";

  return `
    <html>
      <head>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap');

          html, body {
            height: 100%;
            margin: 0;
            background: #f4f7fb;
            font-family: 'Open Sans', sans-serif;
            color: #333;
          }

          body {
            display: flex;
            justify-content: center;
            align-items: flex-start;
          }

          .container {
            display: flex;
            flex-direction: column;
            min-height: 100vh;
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

          .logo:empty {
            display: none;
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
            margin-top: auto;
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
            word-break: break-word;
          }

          .footer a:hover {
            text-decoration: underline;
          }

          .terms {
            margin-top: 15px;
            font-size: 12px;
            color: #aaa;
          }

          @media (max-width: 768px) {
            .container { margin: 20px auto; padding: 20px; }
            .invoice-header { flex-direction: column; text-align: left; }
            .invoice-header .right { text-align: left; }
            h1 { font-size: 22px; }
            .total { font-size: 16px; }
            .chart-container h2 { font-size: 16px; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          ${(logoUrl && logoUrl !== "null") ? `<img src="${logoUrl}" alt="Company Logo" class="logo" />` : ""}

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

          ${data.showChart ? `
            <div class="chart-container">
              <h2>Breakdown</h2>
              <img src="https://quickchart.io/chart?c={
                type:'pie',
                data:{labels:['Subtotal','Tax'],datasets:[{data:[${data.subtotal.replace('€','')},${data.tax.replace('€','')}]}
                ]}
              }" alt="Invoice Breakdown" style="max-width:300px;display:block;margin:auto;" />
            </div>
          ` : ''}

          <div class="footer">
            <p>Thanks for using our service!</p>
            <p>If you have questions, contact us at <a href="mailto:supportpdfifyapi@gmail.com">supportpdfifyapi@gmail.com</a>.</p>
            <p>&copy; 2025 🧾PDFify — All rights reserved.</p>
            <p>
              Generated using <strong>PDFify</strong>. Visit
              <a href="https://pdf-api.portfolio.lidija-jokic.com/" target="_blank">our site</a> for more.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
}


router.post("/generate-invoice", authenticate, async (req, res) => {
  const { data, isPreview } = req.body;  // <-- add isPreview flag

  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const isPremium = !!user?.isPremium;
    //const isPremium = true; 

    const cleanedData = {
      ...data,
      isPremium: isPremium,
      customLogoUrl: isPremium ? data.customLogoUrl || null : null,
      showChart: isPremium ? !!data.showChart : false,
    };

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
    const html = generateInvoiceHTML(cleanedData);
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({ path: pdfPath, format: "A4" });
    await browser.close();

    const pdfBuffer = fs.readFileSync(pdfPath);
    const parsed = await pdfParse(pdfBuffer);
    const pageCount = parsed.numpages;

    console.log(`User used ${pageCount} pages`);

    // Only increment usage if this is NOT a preview
    if (!isPreview) {
      if (user.usageCount + pageCount > user.maxUsage) {
        fs.unlinkSync(pdfPath);
        return res.status(403).json({ error: "Monthly usage limit reached. Upgrade to premium for more pages." });
      }

      user.usageCount += pageCount;
      await user.save();
    }

    // Send PDF back for preview or download
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
