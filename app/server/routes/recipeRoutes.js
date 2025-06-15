const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const router = express.Router();
const fs = require("fs");
const authenticate = require("../middleware/authenticate");
const User = require("../models/User");
const pdfParse = require("pdf-parse");
const dualAuth = require('../middleware/dualAuth');

if (typeof ReadableStream === "undefined") {
  global.ReadableStream = require("web-streams-polyfill").ReadableStream;
}

const defaultLogoUrl = "https://pdf-api.portfolio.lidija-jokic.com/images/Logo.png";

const log = (message, data = null) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(message, data);
  }
};


function generateRecipeHTML(data) {
const watermarkCSS = data.showWatermark
  ? `
    body::before {
      content: "Food Trek";
      position: fixed;
      top: 40%;
      left: 50%;
      font-size: 6rem;
      font-weight: 700;
      color: #eee;
      opacity: 0.05;
      transform: translate(-50%, -50%) rotate(-30deg);
      pointer-events: none;
      user-select: none;
      z-index: 0;
      font-family: 'Playfair Display', serif;
    }
  `
  : '';


  const logoHtml = data.customLogoUrl
    ? `<img src="${data.customLogoUrl}" alt="Logo" class="logo" />`
    : '';

  const breakdownChart = data.showChart && data.ingredientBreakdown
    ? `<div class="chart-container">
        <h2>Ingredient Breakdown</h2>
        <img src="https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify({
          type: 'pie',
          data: {
            labels: Object.keys(data.ingredientBreakdown),
            datasets: [{ data: Object.values(data.ingredientBreakdown) }]
          }
        }))}" alt="Ingredient Breakdown" style="max-width:300px;display:block;margin:auto;" />
      </div>`
    : '';

  return `
    <html>
      <head>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap');
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap');
          body {
            font-family: 'Open Sans', sans-serif;
            color: #333;
            background-color: #f4f7fb;
            margin: 0; padding: 0;
            position: relative;
          }
          ${watermarkCSS}
          .container {
            max-width: 800px;
            margin: 50px auto;
            padding: 40px;
            background-color: #fff;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
            border-radius: 12px;
            position: relative;
            z-index: 1;
          }
          h1 { text-align: center; color: #5e60ce; font-size: 2.5em; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 2px; }
          h2 {
            font-size: 1.8em;
            color: #2a3d66;
            margin-bottom: 15px;
            border-bottom: 2px solid #ddd;
            padding-bottom: 10px;
          }
          p { line-height: 1.8; font-size: 1.1em; margin-bottom: 15px; }
          .section { margin-bottom: 30px; }
          .label { font-weight: bold; color: #5e60ce; font-size: 1.1em; }
          .ingredients, .instructions { padding-left: 20px; }
          .ingredients li, .instructions li { margin-bottom: 8px; font-size: 1.05em; }
          .chart-container { text-align: center; margin: 40px 0 20px; }
          .chart-container h2 { font-size: 18px; color: #2a3d66; margin-bottom: 10px; }
          .footer {
            text-align: center;
            margin-top: 50px;
            font-size: 11px;
            color: #777;
            border-top: 1px dashed #ccc;
            padding-top: 20px;
          }
          .footer a { color: #2a3d66; text-decoration: none; }
          .footer a:hover { text-decoration: underline; }
          .terms { margin-top: 15px; font-size: 12px; color: #aaa; }
          .logo { display: block; margin: 0 auto 30px; max-width: 100px; }
        </style>
      </head>
      <body>
        <div class="container">
          ${logoHtml}
          <h1>${data.recipeName}</h1>
          <div class="section">
            <p><span class="label">Author:</span> ${data.author}</p>
            <p><span class="label">Preparation Time:</span> ${data.prepTime}</p>
            <p><span class="label">Cooking Time:</span> ${data.cookTime}</p>
          </div>
          <div class="section ingredients">
            <h2>Ingredients:</h2>
            <ul>${data.ingredients.map(i => `<li>${i}</li>`).join('')}</ul>
          </div>
          <div class="section instructions">
            <h2>Instructions:</h2>
            <ul>${data.instructions.map(i => `<li>${i}</li>`).join('')}</ul>
          </div>
          ${breakdownChart}
          <div class="footer">
            <p>Enjoy your recipe! For questions, contact us at <a href="mailto:supportpdfifyapi@gmail.com">supportpdfifyapi@gmail.com</a>.</p>
            <p>&copy; 2025 Food Trek Recipes — All rights reserved.</p>
            <p>Generated using <strong>PDFify</strong>. Visit <a href="https://pdf-api.portfolio.lidija-jokic.com/">our site</a> for more.</p>
            <p class="terms">
              Terms & Conditions: This recipe is for personal use only. Reproduction or distribution without permission is prohibited.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
}
router.post("/generate-recipe", authenticate, dualAuth, async (req, res) => {
  const { data, isPreview } = req.body;

  if (!data || !data.recipeName) {
    return res.status(400).json({ error: "Missing recipe data" });
  }

  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const isPremium = user.isPremium;

    
    const now = new Date();
    const lastReset = user.previewLastReset || new Date(0);
    const sameMonth = now.getFullYear() === lastReset.getFullYear() &&
                      now.getMonth() === lastReset.getMonth();

    if (!sameMonth) {
      user.previewCount = 0;
      user.previewLastReset = now;
      await user.save();
    }

    let countAsDownload = false;
    if (isPreview) {
      if (user.previewCount < 3) {
        user.previewCount += 1;
        await user.save();
      } else {
        countAsDownload = true;
      }
    }

 
    const cleanedData = { ...data };
    if ((!isPremium && !isPreview) || countAsDownload) {
      delete cleanedData.ingredientBreakdown;
    }

    const payload = {
      ...cleanedData,
      customLogoUrl: (!isPremium || isPreview || countAsDownload) ? defaultLogoUrl : null,
      showChart: isPremium && !isPreview && !countAsDownload,
      showWatermark: process.env.NODE_ENV === "production" && (!isPremium || isPreview || countAsDownload),
    };

    const html = generateRecipeHTML(payload);

    const pdfDir = path.join(__dirname, "../pdfs");
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const pdfPath = path.join(pdfDir, `recipe_${Date.now()}.pdf`);

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({ path: pdfPath, format: "A4" });
    await browser.close();

    const pdfBuffer = fs.readFileSync(pdfPath);
    const parsed = await pdfParse(pdfBuffer);
    const pageCount = parsed.numpages;

    if (!isPreview || countAsDownload) {
      if (user.usageCount + pageCount > user.maxUsage) {
        fs.unlinkSync(pdfPath);
        return res.status(403).json({ error: "Monthly usage limit reached. Upgrade to premium for more pages." });
      }

      user.usageCount += pageCount;
      await user.save();

      res.download(pdfPath, (err) => {
        if (err) console.error("Error sending file:", err);
        fs.unlinkSync(pdfPath);
      });
    } else {
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="preview.pdf"',
      });
      res.send(pdfBuffer);
      fs.unlinkSync(pdfPath);
    }
  } catch (error) {
    console.error("Recipe PDF generation failed:", error);
    res.status(500).json({ error: "PDF generation failed" });
  }
});

module.exports = router;