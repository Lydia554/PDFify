const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const router = express.Router();
const fs = require("fs");
const authenticate = require("../middleware/authenticate");
const dualAuth = require("../middleware/dualAuth");
const User = require("../models/User"); 
const pdfParse = require("pdf-parse");

if (typeof ReadableStream === "undefined") {
  global.ReadableStream = require("web-streams-polyfill").ReadableStream;
}

const logoUrl = "https://pdf-api.portfolio.lidija-jokic.com/images/Logo.png";

function generateTherapyReportHTML(data, isPremiumUser) {
  const innerHtml = `
    ${!isPremiumUser ? `<img src="${logoUrl}" alt="Logo" class="logo" /><div class="watermark">Confidential</div>` : ''}
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
          /* (Same styling content you provided) */
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

router.post("/generate-therapy-report", authenticate, dualAuth, async (req, res) => {
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

    const user = await User.findById(req.user.userId);
    if (!user) {
      await browser.close();
      return res.status(404).json({ error: "User not found" });
    }

    const isPremiumUser = user.plan === "premium";

    if (!isPremiumUser) {
      const now = new Date();
      // Reset previewCount monthly for basic users
      if (
        !user.previewLastReset ||
        now.getMonth() !== user.previewLastReset.getMonth() ||
        now.getFullYear() !== user.previewLastReset.getFullYear()
      ) {
        user.previewCount = 0;
        user.previewLastReset = now;
      }
      // Reset usageCount monthly
      if (
        !user.usageLastReset ||
        now.getMonth() !== user.usageLastReset.getMonth() ||
        now.getFullYear() !== user.usageLastReset.getFullYear()
      ) {
        user.usageCount = 0;
        user.usageLastReset = now;
      }
    }

    const html = generateTherapyReportHTML(cleanedData, isPremiumUser);
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

    // Only update counts if user is NOT premium
    if (!isPremiumUser) {
      if (isPreview) {
        if (user.previewCount < 3) {
          user.previewCount += 1;
        } else {
          if (user.usageCount + pageCount > user.maxUsage) {
            fs.unlinkSync(pdfPath);
            return res.status(403).json({
              error: "Monthly usage limit reached. Upgrade to premium for more pages.",
            });
          }
          user.usageCount += pageCount;
        }
      } else {
        if (user.usageCount + pageCount > user.maxUsage) {
          fs.unlinkSync(pdfPath);
          return res.status(403).json({
            error: "Monthly usage limit reached. Upgrade to premium for more pages.",
          });
        }
        user.usageCount += pageCount;
      }
      await user.save();
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `${isPreview ? "inline" : "attachment"}; filename=${fileName}`
    );

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
