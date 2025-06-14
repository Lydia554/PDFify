const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const router = express.Router();
const fs = require("fs");
const authenticate = require("../middleware/authenticate");
const dualAuth = require("../middleware/dualAuth");
const User = require("../models/User");
const pdfParse = require("pdf-parse");

function generateRecipeHTML(data) {
  const logoUrl =
    data.isPremium && typeof data.customLogoUrl === "string" && data.customLogoUrl.trim().length > 0
      ? data.customLogoUrl.trim()
      : data.isPremium
      ? "https://pdf-api.portfolio.lidija-jokic.com/images/Logo.png" // default premium logo
      : null; // no logo for non-premium or you can use a basic logo url here

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
      margin: 0; padding: 0; min-height: 100vh; position: relative;
    }
    .container {
      max-width: 800px;
      margin: 20px auto;
      padding: 30px 40px 160px;
      background: linear-gradient(to bottom right, #ffffff, #f8fbff);
      box-shadow: 0 8px 25px rgba(0,0,0,0.08);
      border-radius: 16px;
      border: 1px solid #e0e4ec;
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
    p {
      font-size: 16px;
      margin: 10px 0;
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
      margin-bottom: 15px;
    }
    @media (max-width: 768px) {
      .container {
        margin: 20px auto;
        padding: 20px 20px 160px;
      }
      h1 {
        font-size: 24px;
      }
      .chart-container h2 {
        font-size: 16px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    ${
      logoUrl
        ? `<img src="${logoUrl}" alt="Logo" style="height: 60px; margin-bottom: 20px;" />`
        : ""
    }
    <h1>Recipe for ${data.recipeName || "Unnamed Recipe"}</h1>
    <p><strong>Author:</strong> ${data.authorName || "Unknown"}</p>
    <p><strong>Description:</strong> ${data.description || "No description provided."}</p>
    <p><strong>Preparation Time:</strong> ${data.prepTime || "N/A"}</p>
    <p><strong>Cooking Time:</strong> ${data.cookTime || "N/A"}</p>

    ${
      Array.isArray(data.ingredients) && data.ingredients.length > 0
        ? `<h2>Ingredients</h2><ul>${data.ingredients
            .map((ing) => `<li>${ing}</li>`)
            .join("")}</ul>`
        : ""
    }

    ${
      Array.isArray(data.steps) && data.steps.length > 0
        ? `<h2>Steps</h2><ol>${data.steps
            .map((step) => `<li>${step}</li>`)
            .join("")}</ol>`
        : ""
    }

    ${
      data.showChart
        ? `<div class="chart-container">
          <h2>Nutrition Breakdown</h2>
          <img src="https://quickchart.io/chart?c={
            type:'pie',
            data:{
              labels:['Protein','Carbs','Fat'],
              datasets:[{data:[${data.protein || 0},${data.carbs || 0},${data.fat || 0}]}]
            }
          }" alt="Nutrition Chart" style="max-width:500px; display:block; margin:auto;" />
        </div>`
        : ""
    }
  </div>
</body>
</html>
`;
}

router.post("/generate-recipe", authenticate, dualAuth, async (req, res) => {
  try {
    let { data, isPreview } = req.body;
    if (!data || typeof data !== "object") {
      return res.status(400).json({ error: "Invalid or missing data" });
    }

    // Find user
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Attach user's premium status to data for HTML
    data.isPremium = user.isPremium;

    // If user is not premium, disable logo and chart unless frontend specifically allows chart? Here we disable both
    if (!user.isPremium) {
      data.customLogoUrl = null;
      data.showChart = false;
    }

    const pdfDir = path.join(__dirname, "../pdfs");
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const safeId = data.recipeId || `preview-${Date.now()}`;
    const pdfPath = path.join(pdfDir, `Recipe_${safeId}.pdf`);

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();

    const html = generateRecipeHTML(data);
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({ path: pdfPath, format: "A4" });
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
    }

    res.download(pdfPath, (err) => {
      if (err) {
        // handle error
      }
      fs.unlinkSync(pdfPath);
    });
  } catch (error) {
    res.status(500).json({ error: "Recipe PDF generation failed" });
  }
});

module.exports = router;
