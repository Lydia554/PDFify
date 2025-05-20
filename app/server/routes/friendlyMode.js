const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const multer = require('multer');


const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
  
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage });

const invoiceTemplate = require('../templates-friendly-mode/invoice');
const recipeTemplate = require('../templates-friendly-mode/recipe');

const templates = {
  invoice: invoiceTemplate,
  recipe: recipeTemplate,
};


router.use('/uploads', express.static(uploadDir));


router.post('/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  const imageUrl = `/api/friendly/uploads/${req.file.filename}`;
  res.json({ imageUrl });
});

router.post('/generate', async (req, res) => {
  const { template, ...formData } = req.body; 

  const generateHtml = templates[template];
  if (!generateHtml) return res.status(400).json({ error: 'Invalid template' });

  try {
    const html = generateHtml(formData); 
    const pdfPath = path.join(__dirname, '../../pdfs', `pdf_${Date.now()}.pdf`);

    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({ path: pdfPath, format: 'A4' });
    await browser.close();

    res.download(pdfPath, err => {
      if (err) console.error(err);
      fs.unlinkSync(pdfPath);
    });
  } catch (err) {
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

module.exports = router;
