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

  const items = Array.isArray(data.items) ? data.items : [];

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
    min-height: 100vh;
    position: relative;
  }
  .container {
    max-width: 800px;
    margin: 50px auto;
    padding: 30px 40px;
    padding-bottom: 160px; /* extra space for footer */
    background-color: #fff;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
    border-radius: 12px;
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
  @media (max-width: 768px) {
    .container {
      margin: 20px auto;
      padding: 20px;
      padding-bottom: 160px; /* keep footer space on mobile too */
    }
    .invoice-header {
      flex-direction: column;
      text-align: left;
    }
    .invoice-header .right {
      text-align: left;
    }
    h1 {
      font-size: 22px;
    }
    .total {
      font-size: 16px;
    }
    .chart-container h2 {
      font-size: 16px;
    }
  }
  .footer {
    position: static; /* flow naturally below content */
    max-width: 800px;
    margin: 120px auto 40px auto; /* spacing above and below footer, centered */
    padding: 10px 20px;
    background-color: #f9f9f9;
    color: #444;
    border-top: 1px solid #ccc;
    text-align: center;
    line-height: 1.6;
    font-size: 11px;
    border-radius: 0 0 12px 12px;
    box-sizing: border-box;
    z-index: auto;
  }
  .footer p {
    margin: 6px 0;
  }
  .footer a {
    color: #0073e6;
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
          ${(logoUrl && logoUrl !== "null") ? `<img src="${logoUrl}" alt="Company Logo" class="logo" />` : ""}

          <h1>Invoice for ${data.customerName || "Customer"}</h1>

          <div class="invoice-header">
            <div class="left">
              <p><strong>Order ID:</strong> ${data.orderId || "N/A"}</p>
              <p><strong>Date:</strong> ${data.date || new Date().toLocaleDateString()}</p>
            </div>
            <div class="right">
              <p><strong>Customer:</strong><br>${data.customerName || "N/A"}</p>
              <p><strong>Email:</strong><br><a href="mailto:${data.customerEmail || ""}">${data.customerEmail || "N/A"}</a></p>
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
              ${items.length > 0 ? items.map(item => `
                <tr>
    <td>${item.description && item.description.trim() !== "" ? item.description : "Sample item"}</td>
    <td>${item.quantity || 1}</td>
    <td>${item.price || "9.99"}</td>
  </tr>
              `).join('') : `
                <tr><td colspan="4" style="text-align:center;color:#999;">No items available</td></tr>
              `}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3">Subtotal</td>
                <td>${data.subtotal || "0.00"}</td>
              </tr>
              <tr>
                <td colspan="3">Tax (21%)</td>
                <td>${data.tax || "0.00"}</td>
              </tr>
              <tr>
                <td colspan="3">Total</td>
                <td>${data.total || "0.00"}</td>
              </tr>
            </tfoot>
          </table>

          <div class="total">
            <p>Total Amount Due: ${data.total || "0.00"}</p>
          </div>

          ${data.showChart ? `
            <div class="chart-container">
              <h2>Breakdown</h2>
              <img src="https://quickchart.io/chart?c={
                type:'pie',
                data:{labels:['Subtotal','Tax'],datasets:[{data:[${(data.subtotal || "0").replace('€','')},${(data.tax || "0").replace('€','')}]}
                ]}
              }" alt="Invoice Breakdown" style="max-width:300px;display:block;margin:auto;" />
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
  const { data, isPreview = false } = req.body;

  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const isPremium = !!user?.isPremium;

    const cleanedData = {
      ...data,
      items: Array.isArray(data.items) && data.items.length > 0 ? data.items : [
        { description: "Sample item", quantity: 1, price: "9.99" }
      ],
      isPremium,
      customLogoUrl: isPremium ? (data.customLogoUrl || "https://example.com/default-logo.png") : null,
      showChart: isPremium ? !!data.showChart : false,
      subtotal: data.subtotal && data.subtotal !== "0" ? data.subtotal : "9.99",
      tax: data.tax && data.tax !== "0" ? data.tax : "0.99",
      total: data.total && data.total !== "0" ? data.total : "10.98",
      customerName: data.customerName && data.customerName.trim() !== "" ? data.customerName : "John Doe",
      customerEmail: data.customerEmail && data.customerEmail.trim() !== "" ? data.customerEmail : "customer@example.com",
      orderId: data.orderId && data.orderId.trim() !== "" ? data.orderId : `INV-${Date.now()}`,
      date: data.date || new Date().toLocaleDateString(),
    };
    
    const pdfDir = path.join(__dirname, "../pdfs");
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

    const pdfPath = path.join(pdfDir, `Invoice_${cleanedData.orderId}.pdf`);

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    const html = generateInvoiceHTML(cleanedData);
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({ path: pdfPath, format: "A4", printBackground: true });

    await browser.close();

    
    const pdfData = fs.readFileSync(pdfPath);
    const pdfInfo = await pdfParse(pdfData);
    const pageCount = pdfInfo.numpages;

    if (!isPreview) {
      if (user.usageCount + pageCount > user.maxUsage) {
        fs.unlinkSync(pdfPath);
        return res.status(403).json({ error: "Monthly usage limit reached. Upgrade to premium for more pages." });
      }
      user.usageCount += pageCount;
      await user.save();
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${isPreview ? "inline" : "attachment"}; filename=Invoice_${cleanedData.orderId}.pdf`);

    const fileStream = fs.createReadStream(pdfPath);
    fileStream.pipe(res);

    fileStream.on("end", () => {
      if (!isPreview && fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath);
      }
    });

  } catch (err) {
    console.error("Error during PDF generation:", err);
    res.status(500).json({ error: "Failed to generate PDF invoice." });
  }
});

module.exports = router;