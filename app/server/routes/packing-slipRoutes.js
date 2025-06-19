const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const router = express.Router();
const fs = require("fs");
const authenticate = require("../middleware/authenticate");
const dualAuth = require("../middleware/dualAuth");
const User = require("../models/User");
const pdfParse = require("pdf-parse");

const logoUrl = "https://pdfify.pro/images/Logo.png";

const log = (message, data = null) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(message, data);
  }
};

async function resetMonthlyUsageIfNeeded(user) {
  const now = new Date();
  if (!user.usageLastReset) {
    user.usageLastReset = now;
    user.usageCount = 0;
    user.previewCount = 0;
    await user.save();
    return;
  }

  const lastReset = new Date(user.usageLastReset);
  if (
    now.getFullYear() > lastReset.getFullYear() ||
    now.getMonth() > lastReset.getMonth()
  ) {
    user.usageCount = 0;
    user.previewCount = 0;
    user.usageLastReset = now;
    await user.save();
  }
}

function generatePackingSlipHTML(data, addWatermark = false, isPremiumUser = false) {
  return `
    <html>
      <head>
        <style>
          body {
            font-family: 'Open Sans', sans-serif;
            padding: 40px;
            background-color: #f7f9fc;
            color: #333;
            position: relative;
          }

          .container {
            max-width: 800px;
            margin: auto;
            background: #fff;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.1);
          }

          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #ccc;
            padding-bottom: 15px;
            margin-bottom: 25px;
          }

          .logo {
            height: 60px;
          }

          h1 {
            font-size: 24px;
            margin: 0;
            color: #2a3d66;
          }

          .info {
            margin-bottom: 20px;
          }

          .info p {
            margin: 5px 0;
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          table th, table td {
            border: 1px solid #ddd;
            padding: 12px;
            text-align: left;
          }

          table th {
            background-color: #f0f4fa;
            font-weight: 600;
          }

          table tr:nth-child(even) td {
            background-color: #f9f9f9;
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

          ${addWatermark ? `
            .watermark {
              position: fixed;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%) rotate(-45deg);
              font-size: 5rem;
              color: rgba(255, 0, 0, 0.1);
              user-select: none;
              pointer-events: none;
              z-index: 9999;
              white-space: nowrap;
              font-weight: bold;
            }
          ` : ''}

          @media (max-width: 600px) {
            body {
              padding: 20px;
            }

            .container {
              padding: 20px;
            }

            .header {
              flex-direction: column;
              align-items: flex-start;
            }

            h1 {
              font-size: 20px;
              text-align: left;
            }

            .info p {
              font-size: 15px;
            }

            table th, table td {
              font-size: 14px;
              padding: 10px;
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
        ${addWatermark ? `<div class="watermark">FOR PRODUCTION ONLY - NOT AVAILABLE IN BASIC</div>` : ''}
        <div class="container">
     <div class="header">
            ${!isPremiumUser ? `<img src="${logoUrl}" alt="Company Logo" class="logo" />` : ''}
            <h1>Packing Slip</h1>
          </div>

          <div class="info">
            <p><strong>Order ID:</strong> ${data.orderId}</p>
            <p><strong>Customer:</strong> ${data.customerName}</p>
            <p><strong>Address:</strong> ${data.shippingAddress}</p>
            <p><strong>Date:</strong> ${data.date}</p>
          </div>

          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>SKU</th>
                <th>Quantity</th>
              </tr>
            </thead>
            <tbody>
              ${data.items.map(item => `
                <tr>
                  <td>${item.name}</td>
                  <td>${item.sku || '-'}</td>
                  <td>${item.quantity}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>



          <div class="footer">
      <p>Thanks for using our service!</p>
      <p>If you have questions, contact us at <a href="mailto:pdfifyapi@gmail.com">pdfifyapi@gmail.com</a>.</p>
      <p>&copy; 2025 🧾PDFify — All rights reserved.</p>
      <p>
        Generated using <strong>PDFify</strong>. Visit
        <a href="https://pdfify.pro/" target="_blank">our site</a> for more.
      </p>
    </div>
      </body>

    </html>
  `;
}

router.post("/generate-packing-slip", authenticate, dualAuth, async (req, res) => {
  const { data, isPreview } = req.body;

  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    await resetMonthlyUsageIfNeeded(user);


    const addWatermark = isPreview && !user.isPremium && user.previewCount >= 3;

    if (isPreview) {
      if (!user.isPremium) {
        if (user.previewCount < 3) {
        
          user.previewCount++;
          await user.save();
        } else {
    
          if (user.usageCount >= user.maxUsage) {
            return res.status(403).json({
              error: "Monthly usage limit reached. Upgrade to premium for more previews.",
            });
          }
         
        }
      }
     
    }

    const safeOrderId = data.orderId || `preview-${Date.now()}`;
    const pdfDir = path.join(__dirname, "../pdfs");

    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const pdfPath = path.join(pdfDir, `PackingSlip_${safeOrderId}.pdf`);

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    const html = generatePackingSlipHTML(data, addWatermark, user.isPremium);


    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({ path: pdfPath, format: "A4", printBackground: true });
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
    } else if (addWatermark) {
   
      if (user.usageCount + pageCount > user.maxUsage) {
        fs.unlinkSync(pdfPath);
        return res.status(403).json({
          error: "Monthly usage limit reached. Upgrade to premium for more pages.",
        });
      }
      user.usageCount += pageCount;
      await user.save();
    }
    

    res.download(pdfPath, (err) => {
      if (err) {
        console.error("Error sending file:", err);
      }
      fs.unlinkSync(pdfPath);
    });
  } catch (error) {
    console.error("Packing Slip PDF generation error:", error);
    res.status(500).json({ error: "PDF generation failed" });
  }
});


module.exports = router;
