const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const router = express.Router();
const fs = require("fs");
const authenticate = require("../middleware/authenticate");
const User = require("../models/User"); 
const pdfParse = require("pdf-parse");

if (typeof ReadableStream === "undefined") {
  global.ReadableStream = require("web-streams-polyfill").ReadableStream;
}

const logoUrl = "https://pdf-api.portfolio.lidija-jokic.com/images/Logo.png";

function generateTherapyReportHTML(data) {
  const innerHtml = `
    <div class="watermark">Confidential</div>
    <img src="${logoUrl}" alt="Logo" class="logo" />
    <h1>Therapy Report</h1>

    <div class="section">
      <p><span class="label">Name of Child:</span> <span class="content">${data.childName}</span></p>
      <p><span class="label">Birth Date:</span> <span class="content">${data.birthDate}</span></p>
      <p><span class="label">Session Date:</span> <span class="content">${data.sessionDate}</span></p>
      <p><span class="label">Therapy Type:</span> <span class="content">${data.therapyType}</span></p>
    </div>

    <div class="section">
      <p class="section-title">Observations:</p>
      <p class="content">${data.observations}</p>
    </div>

    <div class="section">
      <p class="section-title">Milestones:</p>
      <div class="multi-column">
        <table class="table">
          <tr><th>Milestone</th><th>Progress</th></tr>
          ${data.milestones.length > 0
            ? data.milestones.map(m => `<tr><td>${m.name}</td><td>${m.progress}</td></tr>`).join('')
            : `<tr><td colspan="2">No milestone data available.</td></tr>`
          }
          
        </table>
      </div>
    </div>

    <div class="section">
      <p class="section-title">Recommendations:</p>
      <p class="content">${data.recommendations}</p>
    </div>

    <div class="chart-container">
      <canvas id="progressChart"></canvas>
    </div>

    <script>
      const ctx = document.getElementById('progressChart').getContext('2d');
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Session 1', 'Session 2', 'Session 3', 'Session 4'],
          datasets: [{
            label: 'Milestone Progress',
            data: [${data.milestonesData.join(',')}],
            backgroundColor: 'rgba(94, 96, 206, 0.5)',
            borderColor: 'rgba(94, 96, 206, 1)',
            borderWidth: 1
          }]
        },
        options: {
          scales: {
            y: { beginAtZero: true }
          }
        }
      });
    </script>
  `;

  return `
    <html>
      <head>
        <style>
          html, body {
            margin: 0;
            padding: 0;
            font-family: 'Arial', sans-serif;
            background-color: #f9f9f9;
            color: #333;
          }
          .page-wrapper {
            display: flex;
            flex-direction: column;
            min-height: 100vh;
            padding: 40px;
            box-sizing: border-box;
          }
          .content-wrapper {
            flex-grow: 1;
          }
          h1 {
            text-align: center;
            color: #5e60ce;
            font-size: 24px;
            margin-bottom: 30px;
          }
          p {
            line-height: 1.8;
            font-size: 16px;
          }
          .section {
            margin-bottom: 25px;
          }
          .label {
            font-weight: bold;
            color: #444;
          }
          .content {
            margin-top: 10px;
            color: #555;
          }
          .section-title {
            margin-top: 20px;
            font-size: 18px;
            font-weight: bold;
            color: #5e60ce;
          }
          .chart-container {
            width: 100%;
            height: 400px;
            margin: 30px 0;
          }
          .logo {
            width: 120px;
            display: block;
            margin: 0 auto 30px;
          }
          .watermark {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            opacity: 0.1;
            font-size: 50px;
            color: #5e60ce;
            font-weight: bold;
            pointer-events: none;
            z-index: 0;
          }
          .multi-column {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
          }
          .table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          .table th, .table td {
            padding: 10px;
            border: 1px solid #ddd;
            text-align: left;
          }
          .table th {
            background-color: #5e60ce;
            color: white;
          }
        .footer {
  font-size: 12px;
  background-color: #f9f9f9;
  color: #444;
  border-top: 1px solid #ccc;
  text-align: center;
  line-height: 1.6;
  padding: 15px 10px;
  margin-top: auto;
}

          .footer a {
            color: #0073e6;
            text-decoration: none;
          }
          .footer a:hover {
            text-decoration: underline;
          }
          @media (max-width: 600px) {
            .page-wrapper {
              padding: 20px;
            }
            h1 {
              font-size: 20px;
            }
            .section-title {
              font-size: 16px;
            }
            p {
              font-size: 14px;
            }
            .multi-column {
              grid-template-columns: 1fr;
            }
            .logo {
              width: 90px;
            }
            .chart-container {
              height: 300px;
            }
            .table th, .table td {
              padding: 8px;
              font-size: 13px;
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
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      </head>
      <body>
        <div class="page-wrapper">
          <div class="content-wrapper">
            ${innerHtml}
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
        </div>
      </body>
    </html>
  `;
}


router.post("/generate-therapy-report", authenticate, async (req, res) => {
  const { data, isPreview = false } = req.body;

  const cleanedData = {
    childName: data?.childName ?? "John Doe",
    birthDate: data?.birthDate ?? "2017-08-16",
    sessionDate: data?.sessionDate ?? new Date().toLocaleDateString(),
    therapyType: data?.therapyType ?? "Occupational Therapy",
    observations: data?.observations ?? "Patient showed engagement in all tasks.",
    recommendations: data?.recommendations ?? "Continue weekly therapy sessions.",
    milestones: Array.isArray(data?.milestones) && data.milestones.length > 0
      ? data.milestones
      : [
          { name: "Fine Motor", progress: "Good" },
          { name: "Verbal Communication", progress: "Needs Improvement" }
        ],
    milestonesData: Array.isArray(data?.milestonesData) && data.milestonesData.length > 0
      ? data.milestonesData
      : [2, 3, 4, 4]
  };
  

  const pdfDir = path.join(__dirname, "../pdfs");
  if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir, { recursive: true });
  }

  const fileName = `therapy_report_${Date.now()}.pdf`;
  const pdfPath = path.join(pdfDir, fileName);

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    const html = generateTherapyReportHTML(cleanedData);
    await page.setContent(html, { waitUntil: "networkidle0" });

    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `<div></div>`,
      footerTemplate: `
        <div style="font-size:10px;width:100%;text-align:center;color:#999;padding:5px 0;">
          Page <span class="pageNumber"></span> of <span class="totalPages"></span>
        </div>
      `,
      margin: {
        top: '40px',
        bottom: '60px'
      }
    });

    await browser.close();

    const pdfBuffer = fs.readFileSync(pdfPath);
    const parsed = await pdfParse(pdfBuffer);
    const pageCount = parsed.numpages;

    const user = await User.findById(req.user.userId);
    if (!user) {
      fs.unlinkSync(pdfPath);
      return res.status(404).json({ error: "User not found" });
    }

    if (!isPreview) {
      if (user.usageCount + pageCount > user.maxUsage) {
        fs.unlinkSync(pdfPath);
        return res.status(403).json({ error: "Monthly usage limit reached. Upgrade to premium for more pages." });
      }

      user.usageCount += pageCount;
      await user.save();
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${isPreview ? "inline" : "attachment"}; filename=${fileName}`);

    const fileStream = fs.createReadStream(pdfPath);
    fileStream.pipe(res);

    fileStream.on("end", () => {
      if (!isPreview && fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath);
      }
    });

  } catch (error) {
    console.error("Therapy report PDF generation failed:", error);
    res.status(500).json({ error: "PDF generation failed" });
  }
});

module.exports = router;
