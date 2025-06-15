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

function wrapHtmlWithBranding(htmlContent, isPremiumUser, addPreviewWatermark) {
  // Always add "Confidential" watermark
  // Add "FOR PRODUCTION ONLY..." only if addPreviewWatermark === true (basic user preview)
  const watermarkHtml = `
    <div class="watermark-confidential">Confidential</div>
    ${addPreviewWatermark ? `<div class="watermark-preview">FOR PRODUCTION ONLY — NOT AVAILABLE IN BASIC VERSION</div>` : ''}
  `;

  return `
  <html>
    <head>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display&display=swap');

        body {
          font-family: Arial, sans-serif;
          margin: 40px;
          background: #f9f9f9;
          color: #333;
        }
        .logo {
          width: 120px;
          display: block;
          margin: 0 auto 30px;
        }
        .watermark-confidential {
          position: fixed;
          top: 40%;
          left: 50%;
          font-size: 6rem;
          font-weight: 700;
          color: #5e60ce;
          opacity: 0.05;
          transform: translate(-50%, -50%) rotate(-30deg);
          pointer-events: none;
          user-select: none;
          z-index: 0;
          font-family: 'Playfair Display', serif;
        }
        .watermark-preview {
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
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    </head>
    <body>
      ${!isPremiumUser ? `<img src="${logoUrl}" alt="Logo" class="logo" />` : ''}
      ${watermarkHtml}
      <div id="content">
        ${htmlContent}
      </div>
    </body>
  </html>
  `;
}

function generateTherapyReportHTML(data, isPremiumUser) {
  const innerHtml = `
    ${!isPremiumUser ? `<div class="watermark">Confidential</div>` : ''}
    ${isPremiumUser ? `<img src="${logoUrl}" alt="Logo" class="logo" />` : ''}
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
          ${
            data.milestones.length > 0
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

    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

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
          },
          animation: {
            onComplete: () => {
              // Add a hidden marker div so Puppeteer can wait for chart completion
              const marker = document.createElement('div');
              marker.id = 'chart-rendered';
              marker.style.display = 'none';
              document.body.appendChild(marker);
            }
          }
        }
      });
    </script>

    <style>
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
      .chart-container {
        width: 100%;
        height: 400px;
        margin: 30px 0;
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

    <div class="footer">
      <p>Thanks for using our service!</p>
      <p>If you have questions, contact us at <a href="mailto:supportpdfifyapi@gmail.com">supportpdfifyapi@gmail.com</a>.</p>
      <p>&copy; 2025 🧾PDFify — All rights reserved.</p>
      <p>
        Generated using <strong>PDFify</strong>. Visit
        <a href="https://pdf-api.portfolio.lidija-jokic.com/" target="_blank">our site</a> for more.
      </p>
    </div>
  `;

  return innerHtml;
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

  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    await resetMonthlyUsageIfNeeded(user);

    const isPremiumUser = user.isPremium;

    const pdfDir = path.join(__dirname, "../pdfs");
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const safeId = `therapyReport_${Date.now()}`;
    const pdfPath = path.join(pdfDir, `${safeId}.pdf`);

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setContent(
      wrapHtmlWithBranding(
        generateTherapyReportHTML(cleanedData, isPremiumUser),
        isPremiumUser,
        isPreview && !isPremiumUser
      ),
      {
        waitUntil: "networkidle0",
      }
    );

    // Wait explicitly for chart-rendered marker (added after Chart.js animation)
    await page.waitForSelector("#chart-rendered", { timeout: 5000 }).catch(() => {
      console.warn("Chart rendering marker not found, proceeding anyway.");
    });

    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      margin: {
        top: "20mm",
        bottom: "20mm",
        left: "15mm",
        right: "15mm",
      },
    });

    await browser.close();

    const pdfBuffer = fs.readFileSync(pdfPath);

    // Track usage only if not preview
    if (!isPreview) {
      user.usageCount = (user.usageCount || 0) + 1;
      await user.save();
    } else {
      // preview count tracking for basic users
      if (!isPremiumUser) {
        user.previewCount = (user.previewCount || 0) + 1;
        await user.save();
      }
    }

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="therapy_report_${safeId}.pdf"`,
      "Content-Length": pdfBuffer.length,
    });

    return res.send(pdfBuffer);

  } catch (error) {
    console.error("Error generating therapy report PDF:", error);
    return res.status(500).json({ error: "Failed to generate therapy report" });
  }
});

module.exports = router;
