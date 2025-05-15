const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const puppeteer = require("puppeteer");
const pdfParse = require("pdf-parse");

const authenticate = require("../middleware/authenticate");
const User = require("../models/User");

// Import HTML template generators (add more as needed)
const templates = {
  invoice: require("../templates/invoice"),
  // e.g. report: require("../templates/report"),
  // e.g. certificate: require("../templates/certificate"),
};

router.post("/generate", authenticate, async (req, res) => {
  const { template, formData } = req.body;

  const generateHTML = templates[template];
  if (!generateHTML) {
    return res.status(400).json({ error: "Template not found" });
  }

  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const html = generateHTML(formData);
    const pdfDir = path.join(__dirname, "../pdfs");
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir);

    const pdfPath = path.join(pdfDir, `Friendly_${Date.now()}.pdf`);

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

    if (user.usageCount + pageCount > user.maxUsage) {
      fs.unlinkSync(pdfPath);
      return res.status(403).json({ error: "Usage limit reached" });
    }

    user.usageCount += pageCount;
    await user.save();

    res.download(pdfPath, (err) => {
      if (err) console.error("Send error:", err);
      fs.unlinkSync(pdfPath);
    });
  } catch (error) {
    console.error("Friendly mode error:", error);
    res.status(500).json({ error: "PDF generation failed" });
  }
});

module.exports = router;
