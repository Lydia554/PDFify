const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const router = express.Router();
const fs = require("fs");
const authenticate = require("../middleware/authenticate");

if (typeof ReadableStream === "undefined") {
  global.ReadableStream = require("web-streams-polyfill").ReadableStream;
}

const log = (message, data = null) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(message, data);
  }
};

function generateTherapyReportHTML(data) {
  
  const baseUrl = process.env.BASE_URL;
  const logoUrl = baseUrl + data.logoUrl; 

  return `
    <html>
      <head>
        <style>
          body { font-family: 'Arial', sans-serif; padding: 40px; color: #333; background-color: #f9f9f9; }
          h1 { text-align: center; color: #5e60ce; font-size: 24px; margin-bottom: 30px; }
          p { line-height: 1.8; font-size: 16px; }
          .section { margin-bottom: 25px; }
          .label { font-weight: bold; color: #444; }
          .content { margin-top: 10px; color: #555; }
          .section-title { margin-top: 20px; font-size: 18px; font-weight: bold; color: #5e60ce; }
          .chart-container { width: 100%; height: 400px; margin: 30px 0; }
          .logo { width: 100px; height: auto; }
          .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: 0.1; font-size: 50px; color: #5e60ce; font-weight: bold; }
          .multi-column { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
          .table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          .table th, .table td { padding: 10px; border: 1px solid #ddd; text-align: left; }
          .table th { background-color: #5e60ce; color: white; }
        </style>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      </head>
      <body>
        <div class="watermark">Confidential</div>
        <header>
          <img src="${logoUrl}" alt="Logo" class="logo">
        </header>
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
              ${data.milestones.map(m => `<tr><td>${m.name}</td><td>${m.progress}</td></tr>`).join('')}
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
          const progressChart = new Chart(ctx, {
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
      </body>
    </html>
  `;
}


router.post("/generate-therapy-report", authenticate, async (req, res) => {
  const { data } = req.body;

  if (!data || !data.childName) {
    return res.status(400).json({ error: "Missing report data" });
  }

  const pdfPath = path.join(__dirname, `../pdfs/therapy_report_${Date.now()}.pdf`);

  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    const html = generateTherapyReportHTML(data);
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

    res.download(pdfPath, (err) => {
      if (err) {
        console.error("Error sending file:", err);
      }
      fs.unlinkSync(pdfPath);
    });
  } catch (error) {
    console.error("Therapy report PDF generation failed:", error);
    res.status(500).json({ error: "PDF generation failed" });
  }
});

module.exports = router;
