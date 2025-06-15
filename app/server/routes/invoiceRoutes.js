const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const router = express.Router();
const fs = require("fs");
const authenticate = require("../middleware/authenticate");
const dualAuth = require("../middleware/dualAuth");
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

  // Watermark HTML for basic users in preview mode ONLY:
  const watermarkHTML = data.showWatermark
    ? `<div class="watermark">FOR PRODUCTION ONLY — NOT AVAILABLE IN BASIC VERSION</div>`
    : "";

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
        position: relative;
        z-index: 1;
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
        margin-bottom: 10px;
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

      /* Watermark styles */
      .watermark {
        position: fixed;
        top: 40%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(-45deg);
        font-size: 60px;
        color: rgba(255, 0, 0, 0.1);
        font-weight: 900;
        pointer-events: none;
        user-select: none;
        z-index: 9999;
        white-space: nowrap;
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

      ${
        data.showChart ? `
        <div class="chart-container">
          <h2>Breakdown</h2>
          <img src="https://quickchart.io/chart?c={
            type:'pie',
            data:{labels:['Subtotal','Tax'],datasets:[{data:[${data.subtotal.replace('€','')},${data.tax.replace('€','')}]}
            ]}
          }" alt="Invoice Breakdown" style="max-width:500px;display:block;margin:auto;" />
        </div>
      ` : ''
      }
    </div>

    ${watermarkHTML}

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

router.post("/generate-invoice", authenticate, dualAuth, async (req, res) => {
  try {
    let { data, isPreview } = req.body;
    if (!data || typeof data !== "object") {
      return res.status(400).json({ error: "Invalid or missing data" });
    }

    // Parse items if sent as JSON string
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

    // Fetch user and check existence
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    // Initialize usage tracking
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    if (
      !user.usage ||
      !user.usage.monthly ||
      user.usage.monthlyYear !== currentYear ||
      user.usage.monthlyMonth !== currentMonth
    ) {
      // Reset usage counters for new month
      user.usage = {
        monthlyCount: 0,
        previewCount: 0,
        monthlyYear: currentYear,
        monthlyMonth: currentMonth,
      };
    }

    // Define limits for Basic users
    const isBasicUser = user.role === "Basic";
    const MAX_PREVIEWS_PER_MONTH = 20;
    const MAX_MONTHLY_GENERATIONS = 2000;

    // Usage enforcement
    if (isBasicUser) {
      if (isPreview) {
        if (user.usage.previewCount >= MAX_PREVIEWS_PER_MONTH) {
          return res.status(429).json({
            error: "Preview limit reached for this month. Upgrade to Premium to continue.",
          });
        }
        // Increment preview count
        user.usage.previewCount += 1;
      } else {
        if (user.usage.monthlyCount >= MAX_MONTHLY_GENERATIONS) {
          return res.status(429).json({
            error: "Monthly generation limit reached. Upgrade to Premium to continue.",
          });
        }
        // Increment monthly generation count
        user.usage.monthlyCount += 1;
      }
    } else {
      // Premium users: track monthlyCount only (optional)
      if (!user.usage.monthlyCount) user.usage.monthlyCount = 0;
      user.usage.monthlyCount += 1;
    }

    // Save usage update
    await user.save();

    // Prepare data for HTML generation
    // Show watermark only for basic users in preview mode
    invoiceData.showWatermark = isBasicUser && isPreview;

    const html = generateInvoiceHTML(invoiceData);

    // Launch Puppeteer to generate PDF
    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();

    // Set content with waitUntil networkidle0 for better load stability
    await page.setContent(html, { waitUntil: "networkidle0" });

    // Optionally set PDF options
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
    });

    await browser.close();

    // Send PDF as response
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=invoice_${invoiceData.orderId || "output"}.pdf`,
      "Content-Length": pdfBuffer.length,
    });

    return res.send(pdfBuffer);
  } catch (err) {
    console.error("Error generating invoice PDF:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
