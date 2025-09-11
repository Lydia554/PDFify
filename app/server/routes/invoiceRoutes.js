// server/routes/invoiceRoutes.js
const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const router = express.Router();
const fs = require("fs");
const archiver = require("archiver");
const os = require("os");
const { execFile } = require("child_process");

const User = require("../models/User");
const authenticate = require("../middleware/authenticate");
const dualAuth = require("../middleware/dualAuth");
const { generateZugferdXML } = require('../utils/zugferdHelper');
const { incrementUsage } = require("../utils/usageUtils");
const { postProcessPdfStrict } = require('../utils/postProcessPdfStrict');
const { PDFDocument } = require("pdf-lib");

const locales = {
  sl: require('../../locales/sl.json'),
  en: require('../../locales/en.json'),
  de: require('../../locales/de.json'),
};

const { generateInvoiceHTML: generateEnglishInvoice } = require("../../templates/english.js");
const FORCE_PLAN = process.env.FORCE_PLAN;

// --- Detect Ghostscript executable ---
function detectGhostscript() {
  const possiblePaths = [
    'C:\\Program Files\\gs\\gs10.05.1\\bin\\gswin64c.exe',
    'C:\\Program Files (x86)\\gs\\gs10.05.1\\bin\\gswin32c.exe',
    'gswin64c',
    'gswin32c',
    'gs'
  ];

  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) return p; // absolute path
    } catch (e) { /* ignore */ }
    try {
      // test in PATH (silent)
      require('child_process').execSync(`${p} -v`, { stdio: 'ignore' });
      return p;
    } catch (e) { /* not found in PATH */ }
  }
  throw new Error('Ghostscript not found. Please install it or add it to PATH.');
}

router.post("/generate-invoice", authenticate, dualAuth, async (req, res) => {
  console.log("🌐 /generate-invoice router hit");

  const iccPath = path.resolve(__dirname, "../routes/sRGB_v4_ICC_preference.icc");
  if (!fs.existsSync(iccPath)) return res.status(500).json({ error: "ICC profile missing." });

  const tmpDir = path.join(os.tmpdir(), `pdfify-batch-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  let browser;
  try {
    let requests = req.body.requests;
    if (!Array.isArray(requests)) requests = [{ data: req.body.data, isPreview: req.body.isPreview }];
    if (!requests.length || requests.length > 100) return res.status(400).json({ error: "1-100 requests only." });

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
    const results = [];
    const gsExe = detectGhostscript();
    console.log("🎯 Ghostscript detected:", gsExe);

    for (const [index, { data, isPreview }] of requests.entries()) {
      if (!data) { results.push({ error: "Invalid data" }); continue; }

      const invoiceData = { ...data };
      const country = (invoiceData.country || "slovenia").toLowerCase();
      invoiceData.country = country;

      if (country === "germany" && Array.isArray(invoiceData.items)) {
        invoiceData.items = invoiceData.items.map(item => {
          const totalNum = parseFloat(item.total || 0);
          const net = totalNum / 1.19;
          const tax = totalNum - net;
          return { ...item, net: net.toFixed(2), tax: tax.toFixed(2) };
        });
      }

      invoiceData.taxRate = typeof invoiceData.taxRate === "number"
        ? `${(invoiceData.taxRate * 100).toFixed(0)}%`
        : invoiceData.taxRate || '21%';
      invoiceData.locale = locales[country === 'germany' ? 'de' : 'sl'] || locales["en"];

      // Puppeteer PDF
      const html = generateEnglishInvoice({ ...invoiceData, isPreview });
      const page = await browser.newPage();
      await page.emulateMediaType('print');
      await page.evaluateOnNewDocument(() => document.documentElement.style.setProperty('--pdf-a-mode', 'true'));
      await page.setContent(html, { waitUntil: "networkidle0" });

      let pdfBuffer = await page.pdf({
        format: "A4", printBackground: true,
        margin: { top: "20mm", bottom: "20mm", left: "10mm", right: "10mm" },
        preferCSSPageSize: false, displayHeaderFooter: false, tagged: true
      });
      await page.close();

      // Ghostscript conversion
      const tempInput = path.join(tmpDir, `input-${index}.pdf`);
      const tempOutput = path.join(tmpDir, `output-${index}.pdf`);
      fs.writeFileSync(tempInput, pdfBuffer);

      const gsArgs = [
        "-dPDFA=3", "-dBATCH", "-dNOPAUSE", "-dNOOUTERSAVE", "-sDEVICE=pdfwrite",
        "-dEmbedAllFonts=true", "-dSubsetFonts=true",
        "-dPreserveDocInfo=true", "-dPreserveAnnots=true", "-dPDFACompatibilityPolicy=1",
        "-dAutoRotatePages=/None", "-sColorConversionStrategy=RGB", "-dProcessColorModel=/DeviceRGB",
        "-dConvertCMYKImagesToRGB=true", "-dDownsampleColorImages=false", "-dDownsampleGrayImages=false",
        "-dDownsampleMonoImages=false", "-dPDFSETTINGS=/prepress",
        `-sOutputICCProfile=${iccPath}`, `-sOutputFile=${tempOutput}`, tempInput.replace(/\\/g, "/")
      ];

      try {
        await new Promise((resolve, reject) =>
          execFile(gsExe, gsArgs, err => err ? reject(err) : resolve())
        );
      } catch (gsErr) {
        console.error("❌ Ghostscript conversion failed:", gsErr);
        results.push({ index, error: "Ghostscript conversion failed", details: gsErr.message });
        fs.unlinkSync(tempInput);
        continue;
      }

      // Load the GS output
      let finalPdf = fs.readFileSync(tempOutput);
      fs.unlinkSync(tempInput); // remove input

      // Post-process: attach OutputIntent/XMP/ZUGFeRD if needed
      // We pass iccPath so postProcess can add OutputIntents if missing or incorrect
      if (user.plan === "pro") {
        const xmpPath = path.resolve(__dirname, "../xmp/zugferd.xmp");
        const zugferdXml = generateZugferdXML(invoiceData);
        finalPdf = await postProcessPdfStrict(finalPdf, xmpPath, zugferdXml, iccPath);
      } else {
        // even for non-pro, ensure OutputIntents exist by running postProcess with minimal data
        finalPdf = await postProcessPdfStrict(finalPdf, null, null, iccPath);
      }

      // Count pages and usage
      const pdfDoc = await PDFDocument.load(finalPdf);
      const pageCount = pdfDoc.getPageCount();
      const usageAllowed = await incrementUsage(user, pageCount, isPreview, FORCE_PLAN);
      if (!usageAllowed) return res.status(403).json({ error: 'Monthly limit reached.' });

      results.push({ index, pdf: finalPdf });
      // remove gs output file
      try { fs.unlinkSync(tempOutput); } catch (e) { /* ignore */ }
    }

    // Send results
    if (results.length === 1 && results[0].pdf) {
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename=invoice.pdf`,
        "Content-Length": results[0].pdf.length
      });
      return res.send(results[0].pdf);
    } else {
      const archive = archiver("zip", { zlib: { level: 9 } });
      res.set({ "Content-Type": "application/zip", "Content-Disposition": `attachment; filename=invoices.zip` });
      archive.pipe(res);
      results.forEach(({ index, pdf }) => {
        if (pdf) archive.append(pdf, { name: `invoice-${index + 1}.pdf` });
      });
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
