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


function generateRecipeHTML(data) {
  const breakdownChart = data.ingredientBreakdown
    ? `<div class="chart-container">
        <h2>Ingredient Breakdown</h2>
        <img src="https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify({
          type: 'pie',
          data: {
            labels: Object.keys(data.ingredientBreakdown),
            datasets: [{
              data: Object.values(data.ingredientBreakdown)
            }]
          }
        }))}" alt="Ingredient Breakdown" style="max-width:300px;display:block;margin:auto;" />
      </div>`
    : '';

  return `
    <html>
      <head>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap');

          body {
            font-family: 'Open Sans', sans-serif;
            color: #333;
            background-color: #f4f7fb;
            margin: 0;
            padding: 0;
          }

          .container {
            max-width: 800px;
            margin: 50px auto;
            padding: 40px;
            background-color: #fff;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
            border-radius: 12px;
          }

          h1 {
            text-align: center;
            color: #5e60ce;
            font-size: 2.5em;
            margin-bottom: 20px;
            text-transform: uppercase;
            letter-spacing: 2px;
          }

          h2 {
            font-size: 1.8em;
            color: #2a3d66;
            margin-bottom: 15px;
            border-bottom: 2px solid #ddd;
            padding-bottom: 10px;
          }

          p {
            line-height: 1.8;
            font-size: 1.1em;
            margin-bottom: 15px;
          }

          .section {
            margin-bottom: 30px;
          }

          .label {
            font-weight: bold;
            color: #5e60ce;
            font-size: 1.1em;
          }

          .ingredients, .instructions {
            padding-left: 20px;
          }

          .ingredients li, .instructions li {
            margin-bottom: 8px;
            font-size: 1.05em;
          }

          .chart-container {
            text-align: center;
            margin: 40px 0 20px;
          }

          .chart-container h2 {
            font-size: 18px;
            color: #2a3d66;
            margin-bottom: 10px;
          }

          .footer {
            text-align: center;
            margin-top: 40px;
            font-size: 14px;
            color: #777;
            border-top: 1px dashed #ccc;
            padding-top: 20px;
          }

          .footer a {
            color: #2a3d66;
            text-decoration: none;
          }

          .footer a:hover {
            text-decoration: underline;
          }

          .terms {
            margin-top: 15px;
            font-size: 12px;
            color: #aaa;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>${data.recipeName}</h1>

          <div class="section">
            <p><span class="label">Author:</span> ${data.author}</p>
            <p><span class="label">Preparation Time:</span> ${data.prepTime}</p>
            <p><span class="label">Cooking Time:</span> ${data.cookTime}</p>
          </div>

          <div class="section ingredients">
            <h2>Ingredients:</h2>
            <ul>
              ${data.ingredients.map(ingredient => `<li>${ingredient}</li>`).join('')}
            </ul>
          </div>

          <div class="section instructions">
            <h2>Instructions:</h2>
            <ul>
              ${data.instructions.map(instruction => `<li>${instruction}</li>`).join('')}
            </ul>
          </div>

          ${breakdownChart}

          <div class="footer">
            <p>Enjoy your recipe! For questions, contact us at <a href="mailto:support@pdfgeneratorapp.gmail.com">support@pdfgeneratorapp.gmail.com</a>.</p>
            <p>&copy; 2025 Food Trek Recipes — All rights reserved.</p>
            <p class="terms">
              Terms & Conditions: This recipe is for personal use only. Reproduction or distribution without permission is prohibited.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
}



router.post("/generate-recipe", authenticate, async (req, res) => {
  const { data } = req.body;
  log("Received data for recipe generation:", data);

  if (!data || !data.recipeName) {
    log("Invalid recipe data:", data);
    return res.status(400).json({ error: "Missing recipe data" });
  }

  const pdfPath = path.join(__dirname, `../pdfs/recipe_${Date.now()}.pdf`);

  try {
    log("Launching Puppeteer...");
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    log("Puppeteer launched successfully.");

    const page = await browser.newPage();
    log("New page created.");

    const html = generateRecipeHTML(data);
    log("Generated HTML for recipe:", html);

    await page.setContent(html, { waitUntil: "networkidle0" });
    log("HTML content set on the page.");

    await page.pdf({ path: pdfPath, format: "A4" });
    log("PDF generated successfully at:", pdfPath);

    await browser.close();
    log("Browser closed.");

    res.download(pdfPath, (err) => {
      if (err) {
        console.error("Error sending file:", err);
      }
      fs.unlinkSync(pdfPath); 
    });
  } catch (error) {
    console.error("Recipe PDF generation failed:", error);
    res.status(500).json({ error: "PDF generation failed" });
  }
});

module.exports = router;