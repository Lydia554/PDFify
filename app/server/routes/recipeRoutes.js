const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const router = express.Router();
const fs = require("fs");
const authenticate = require("../middleware/authenticate");
const User = require("../models/User");
const dualAuth = require('../middleware/dualAuth');
const { PDFDocument } = require("pdf-lib");
const { incrementUsage } = require("../utils/usageUtils");


if (typeof ReadableStream === "undefined") {
  global.ReadableStream = require("web-streams-polyfill").ReadableStream;
}

const defaultLogoUrl = "https://pdfify.pro/images/Logo.png";

const log = (message, data = null) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(message, data);
  }
};
function generateRecipeHTML(data) {
  log("🧪 Inside HTML Generator - showChart:", data.showChart);
  log("🧪 customLogoUrl:", data.customLogoUrl);

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

  const watermarkCSS = data.showWatermark
    ? `
      /* Watermark */
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

  const footerNote = data.showWatermark
    ? `<div class="footer watermark">
        
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
    position: static;
    max-width: 800px;
    margin: 40px auto 10px auto;
    padding: 10px 20px;
    background-color: #f0f2f7;
    color: #555;
    border-top: 2px solid #cbd2e1;
    text-align: center;
    line-height: 1.6;
    font-size: 9px;
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



          .terms { margin-top: 15px; font-size: 11px; color: #aaa; }
          .logo { display: block; margin: 0 auto 30px; max-width: 100px; }
          .watermark { color: #c44; font-weight: bold; }

          @media (max-width: 600px) {
            .container { padding: 20px; margin: 20px; }
            h1 { font-size: 1.8em; letter-spacing: 1px; }
            h2 { font-size: 1.4em; }
            p { font-size: 1em; }
            .label { font-size: 1em; }
            .ingredients li, .instructions li { font-size: 1em; }
            .chart-container h2 { font-size: 16px; }
            .footer { font-size: 9px; }
            .terms { font-size: 11px; }
            .logo { max-width: 80px; margin-bottom: 20px; }
          }
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
          <div/>

      <div class="footer">
      <p>Thanks for using our service!</p>
      <p>If you have questions, contact us at <a href="mailto:pdfifyapi@gmail.com">pdfifyapi@gmail.com</a>.</p>
      <p>&copy; 2025 🧾PDFify — All rights reserved.</p>
      <p>
        Generated using <strong>PDFify</strong>. Visit
        <a href="https://pdfify.pro/" target="_blank">our site</a> for more.
      </p>
    </div>

          ${footerNote}
        </div>
      </body>
    </html>
  `;
}


router.post("/generate-recipe", authenticate, dualAuth, async (req, res) => {
  const { data, isPreview = false } = req.body;
  log("Received data for recipe generation:", data);

  if (!data || !data.recipeName) {
    log("Invalid recipe data:", data);
    return res.status(400).json({ error: "Missing recipe data" });
  }

  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const isPremium = user.isPremium;

    const cleanedData = { ...data };
    if (!isPremium) delete cleanedData.ingredientBreakdown;

    const payload = {
      ...cleanedData,
      customLogoUrl: isPremium ? null : defaultLogoUrl,
      showChart: isPremium,
      showWatermark: !isPremium,
    };

    log("User isPremium:", isPremium);
    log("Payload sent to HTML generator:", payload);

    const html = generateRecipeHTML(payload);

    const pdfDir = path.join(__dirname, "../pdfs");
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

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

    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pageCount = pdfDoc.getPageCount();
    log(`Generated PDF has ${pageCount} pages.`);

 
const usageAllowed = await incrementUsage(user, pageCount, isPreview);
if (!usageAllowed) {
  return res.status(403).json({ error: 'Monthly usage limit reached. Upgrade to premium for more pages.' });
}


    res.download(pdfPath, (err) => {
      if (err) console.error("Error sending file:", err);
      fs.unlinkSync(pdfPath);
    });
  } catch (error) {
    console.error("Recipe PDF generation failed:", error);
    res.status(500).json({ error: "PDF generation failed" });
  }
});

module.exports = router;
