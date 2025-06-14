const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const router = express.Router();
const fs = require("fs");
const authenticate = require("../middleware/authenticate");
const User = require("../models/User");

// Your recipe HTML generator (adjust as needed)
function generateRecipeHTML(data) {
  // Example basic template — adapt your actual HTML here
  const logoHtml = data.customLogoUrl
    ? `<img src="${data.customLogoUrl}" alt="Logo" class="logo" style="height: 60px;" />`
    : "";

  const watermarkHtml = data.showWatermark
    ? `<div class="watermark" style="position: fixed; bottom: 20px; right: 20px; opacity: 0.3; font-size: 20px;">Food Trek</div>`
    : "";

  const chartHtml = data.showChart
    ? `<div class="chart"><!-- Your chart here --></div>`
    : "";

  return `
  <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .logo { margin-bottom: 20px; }
        .watermark { color: #ccc; }
      </style>
    </head>
    <body>
      ${logoHtml}
      <h1>${data.title || "Recipe"}</h1>
      <p>${data.description || ""}</p>
      ${chartHtml}
      ${watermarkHtml}
    </body>
  </html>
  `;
}

router.post("/generate-recipe", authenticate, async (req, res) => {
  try {
    let { data, isPreview } = req.body;

    if (!data || typeof data !== "object") {
      return res.status(400).json({ error: "Invalid or missing data" });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Default logo URL (basic users get this)
    const defaultLogoUrl = "https://pdf-api.portfolio.lidija-jokic.com/images/Logo.png";

    // Apply premium logic same as invoice route:
    if (!user.isPremium) {
      data.customLogoUrl = defaultLogoUrl;  // Show default logo for non-premium
      data.showChart = false;                // Hide chart for non-premium
      data.showWatermark = true;             // Show watermark for non-premium
    } else {
      // Premium users: no default logo, show chart, no watermark
      data.customLogoUrl = null;
      data.showChart = true;
      data.showWatermark = false;
    }

    const safeId = data.id || `preview-${Date.now()}`;
    const pdfDir = path.join(__dirname, "../pdfs");
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
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

    // Add page count check and usage limits as needed, similar to invoice route
    // ...

    res.download(pdfPath, (err) => {
      fs.unlinkSync(pdfPath);
      if (err) {
        console.error("Error sending PDF:", err);
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "PDF generation failed" });
  }
});

module.exports = router;
