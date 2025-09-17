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
    'C:\\Program Files (x86)\\gs\\gs10.05.1\\bin\\gswin32c.exe'
  ];

  for (const p of possiblePaths) if (fs.existsSync(p)) return p;

  try { if (require('child_process').execSync('gswin64c -v', { stdio: 'pipe' }).toString().includes("Ghostscript")) return "gswin64c"; } catch {}
  try { if (require('child_process').execSync('gs -v', { stdio: 'pipe' }).toString().includes("Ghostscript")) return "gs"; } catch {}

  throw new Error('Ghostscript not found. Please install it or add it to PATH.');
}

// --- /generate-invoice route ---
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
      const orderId = invoiceData.orderId || `order-${index + 1}`;
      invoiceData.orderId = orderId; // ensure it’s in the invoiceData

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

      // --- Puppeteer PDF generation ---
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

      // --- Ghostscript PDF/A-3b conversion ---
      const tempInput = path.join(tmpDir, `input-${orderId}.pdf`);
      const tempOutput = path.join(tmpDir, `output-${orderId}.pdf`);
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

      await new Promise((resolve, reject) =>
        execFile(gsExe, gsArgs, err => err ? reject(err) : resolve())
      );

      let finalPdf = fs.readFileSync(tempOutput);
      fs.unlinkSync(tempInput);

      // --- Post-process for Pro users ---
      if (user.plan === "pro") {
        const zugferdXml = generateZugferdXML(invoiceData);
        const localeMeta = {
          title: invoiceData.locale.invoiceTitle || 'Invoice',
          creator: 'PDFify',
          language: country === 'germany' ? 'de' : country === 'slovenia' ? 'sl' : 'en'
        };

        finalPdf = await postProcessPdfStrict(
          finalPdf,
          zugferdXml,
          localeMeta,
          path.resolve(__dirname, "../server/xmp/zugferd.xmp") 
        );
      }

      // --- Increment usage ---
      const pdfDoc = await require("pdf-lib").PDFDocument.load(finalPdf);
      const pageCount = pdfDoc.getPageCount();
      const usageAllowed = await incrementUsage(user, pageCount, isPreview, FORCE_PLAN);
      if (!usageAllowed) return res.status(403).json({ error: 'Monthly limit reached.' });

      results.push({ index, pdf: finalPdf, orderId });
    }

    // --- Send results ---
    if (results.length === 1) {
      const { pdf, orderId } = results[0];
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename=${orderId}.pdf`,
        "Content-Length": pdf.length
      });
      res.send(pdf);
    } else {
      const archive = archiver("zip", { zlib: { level: 9 } });
      res.set({ "Content-Type": "application/zip", "Content-Disposition": `attachment; filename=invoices.zip` });
      archive.pipe(res);
      results.forEach(({ pdf, orderId }) => archive.append(pdf, { name: `${orderId}.pdf` }));
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
