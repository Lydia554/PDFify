const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const router = express.Router();
const fs = require("fs");
const os = require("os");
const archiver = require("archiver");
const { execFile } = require("child_process");

const User = require("../models/User");
const authenticate = require("../middleware/authenticate");
const dualAuth = require("../middleware/dualAuth");
const { generateZugferdXML } = require('../utils/zugferdHelper');
const { incrementUsage } = require("../utils/usageUtils");
const { postProcessPdfStrict } = require('../utils/postProcessPdfStrict');

const locales = {
  sl: require('../../locales/sl.json'),
  en: require('../../locales/en.json'),
  de: require('../../locales/de.json'),
};

const { generateInvoiceHTML } = require("../../templates/english.js");
const FORCE_PLAN = process.env.FORCE_PLAN;
const iccPath = path.resolve(__dirname, "../routes/sRGB_v4_ICC_preference.icc");

function detectGhostscript() {
  const possiblePaths = [
    'C:\\Program Files\\gs\\gs10.05.1\\bin\\gswin64c.exe',
    'C:\\Program Files (x86)\\gs\\gs10.05.1\\bin\\gswin32c.exe'
  ];
  for (const p of possiblePaths) if (fs.existsSync(p)) return p;
  try { if (require('child_process').execSync('gswin64c -v', { stdio: 'pipe' }).toString().includes("Ghostscript")) return "gswin64c"; } catch {}
  try { if (require('child_process').execSync('gs -v', { stdio: 'pipe' }).toString().includes("Ghostscript")) return "gs"; } catch {}
  throw new Error('Ghostscript not found. Please install it or add it to PATH.');
}

router.post("/generate-invoice", authenticate, dualAuth, async (req, res) => {
  const tmpDir = path.join(os.tmpdir(), `pdfify-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  let browser;
  try {
    let requests = Array.isArray(req.body.requests) ? req.body.requests : [{ data: req.body.data, isPreview: req.body.isPreview }];
    if (!requests.length || requests.length > 100) return res.status(400).json({ error: "1-100 requests only." });

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
    const results = [];
    const gsExe = detectGhostscript();

    for (const [index, { data, isPreview }] of requests.entries()) {
      if (!data) { results.push({ error: "Invalid data" }); continue; }

      const invoiceData = { ...data, country: (data.country || 'slovenia').toLowerCase() };
      invoiceData.locale = locales[invoiceData.country === 'germany' ? 'de' : 'sl'] || locales.en;

      // Puppeteer PDF
      const html = generateInvoiceHTML({ ...invoiceData, isPreview });
      const page = await browser.newPage();
      await page.emulateMediaType('print');
      await page.evaluateOnNewDocument(() => document.documentElement.style.setProperty('--pdf-a-mode', 'true'));
      await page.setContent(html, { waitUntil: "networkidle0" });

      const pdfBuffer = await page.pdf({
        format: "A4", printBackground: true,
        margin: { top: "20mm", bottom: "20mm", left: "10mm", right: "10mm" },
        preferCSSPageSize: false, displayHeaderFooter: false, tagged: true
      });
      await page.close();

      // --- Save temp input PDF ---
      const tempInput = path.join(tmpDir, `input-${index}.pdf`);
      const tempOutput = path.join(tmpDir, `output-${index}.pdf`);
      fs.writeFileSync(tempInput, pdfBuffer);

      // --- Ghostscript PDF/A-3b conversion ---
      await new Promise((resolve, reject) => {
        const gsArgs = [
          "-dPDFA=3",
          "-dBATCH",
          "-dNOPAUSE",
          "-dNOOUTERSAVE",
          "-sDEVICE=pdfwrite",
          "-dEmbedAllFonts=true",
          "-dSubsetFonts=true",
          "-dPreserveDocInfo=true",
          "-dPDFACompatibilityPolicy=1",
          "-dAutoRotatePages=/None",
          "-sColorConversionStrategy=RGB",
          "-dProcessColorModel=/DeviceRGB",
          `-sOutputICCProfile=${iccPath}`,
          `-sOutputFile=${tempOutput}`,
          tempInput
        ];

        execFile(gsExe, gsArgs, (err, stdout, stderr) => {
          if (err) {
            console.error("❌ Ghostscript error:", stderr || err);
            return reject(err);
          }
          resolve();
        });
      });

      let finalPdf = fs.readFileSync(tempOutput);

      // --- Post-process for XMP / ZUGFeRD ---
      if (user.plan === "pro") {
        const zugferdXml = generateZugferdXML(invoiceData);
        const localeMeta = {
          title: invoiceData.locale.invoiceTitle || 'Invoice',
          creator: 'PDFify',
          language: invoiceData.country === 'germany' ? 'de' : 'en'
        };
        finalPdf = await postProcessPdfStrict(finalPdf, zugferdXml, localeMeta);
      }

      // --- Usage counting ---
      const pdfDoc = await require("pdf-lib").PDFDocument.load(finalPdf);
      const pageCount = pdfDoc.getPageCount();
      const usageAllowed = await incrementUsage(user, pageCount, isPreview, FORCE_PLAN);
      if (!usageAllowed) return res.status(403).json({ error: 'Monthly limit reached.' });

      results.push({ index, pdf: finalPdf });
    }

    // --- Send results ---
    if (results.length === 1) {
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename=invoice.pdf`,
        "Content-Length": results[0].pdf.length
      });
      res.send(results[0].pdf);
    } else {
      const archive = archiver("zip", { zlib: { level: 9 } });
      res.set({ "Content-Type": "application/zip", "Content-Disposition": `attachment; filename=invoices.zip` });
      archive.pipe(res);
      results.forEach(({ index, pdf }) => archive.append(pdf, { name: `invoice-${index + 1}.pdf` }));
      await archive.finalize();
    }

    await user.save();
  } catch (err) {
    console.error("❌ Exception in /generate-invoice:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  } finally {
    if (browser) await browser.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

module.exports = router;
