const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFile } = require("child_process");
const archiver = require("archiver");

const User = require("../models/User");
const authenticate = require("../middleware/authenticate");
const dualAuth = require("../middleware/dualAuth");
const { generateZugferdXML } = require('../utils/zugferdHelper');
const { incrementUsage } = require("../utils/usageUtils");
const { postProcessPdfStrict } = require('../utils/postProcessPdfStrict');
const { generateInvoiceHTML } = require("../../templates/english.js"); 

const locales = {
  sl: require('../../locales/sl.json'),
  en: require('../../locales/en.json'),
  de: require('../../locales/de.json'),
};

const FORCE_PLAN = process.env.FORCE_PLAN;

// --- Detect Ghostscript dynamically ---
function detectGhostscript() {
  const possiblePaths = [
    '/usr/bin/gs', '/usr/local/bin/gs',
    'C:\\Program Files\\gs\\bin\\gswin64c.exe',
    'C:\\Program Files (x86)\\gs\\bin\\gswin32c.exe'
  ];
  for (const p of possiblePaths) if (fs.existsSync(p)) return p;
  const { execSync } = require('child_process');
  try { if (execSync('gs -v', { stdio: 'pipe' }).toString().includes('Ghostscript')) return 'gs'; } catch {}
  try { if (execSync('gswin64c -v', { stdio: 'pipe' }).toString().includes('Ghostscript')) return 'gswin64c'; } catch {}
  throw new Error('Ghostscript not found. Please install it or add it to PATH.');
}

// --- /generate-invoice ---
router.post("/generate-invoice", authenticate, dualAuth, async (req, res) => {
  const tmpDir = path.join(os.tmpdir(), `pdfify-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  let browser;
  try {
    let requests = req.body.requests;
    if (!Array.isArray(requests)) requests = [{ data: req.body.data, isPreview: req.body.isPreview }];
    if (!requests.length) return res.status(400).json({ error: "No requests provided." });

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
    const results = [];
    const tempResults = [];
    let totalPages = 0; 

    for (const { data: invoiceDataRaw, isPreview } of requests) {
      const invoiceData = { ...invoiceDataRaw };
      const orderId = invoiceData.orderId || `order-${Date.now()}`;

      // fallback: if no country/language specified, use default English
      const country = (invoiceData.country || "").toLowerCase();
      const lang = invoiceData.invoiceLanguage || (country === "germany" ? "de" : country === "slovenia" ? "sl" : "en");
      invoiceData.country = country || "default";
      invoiceData.locale = locales[lang] || locales["en"];

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

      const page = await browser.newPage();
      await page.emulateMediaType('print');
      await page.evaluateOnNewDocument(() => document.documentElement.style.setProperty('--pdf-a-mode', 'true'));

      // --- Use default English template if no country/language specified ---
      let html;
      if (!invoiceDataRaw.country || !invoiceDataRaw.invoiceLanguage) {
        html = generateInvoiceHTML({ ...invoiceData, isPreview });
      } else {
        // If you have other language templates, you can swap here
        html = generateInvoiceHTML({ ...invoiceData, isPreview }); // fallback to English anyway
      }

      await page.setContent(html, { waitUntil: "networkidle0", timeout: 0 });

      const pdfBuffer = await page.pdf({
        format: "A4", printBackground: true,
        margin: { top: "20mm", bottom: "20mm", left: "10mm", right: "10mm" },
        preferCSSPageSize: false, displayHeaderFooter: false, tagged: true
      });
      await page.close();

      // Count pages
      const pdfDoc = await require("pdf-lib").PDFDocument.load(pdfBuffer);
      const pageCount = pdfDoc.getPageCount();
      totalPages += pageCount;

      tempResults.push({ pdfBuffer, orderId });
    }

    // ✅ Check monthly page limit ONCE
    const usageAllowed = await incrementUsage(user, totalPages, false, FORCE_PLAN);
    if (!usageAllowed) {
      await browser.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return res.status(403).json({ error: 'Monthly limit reached.' });
    }

    // Ghostscript + ZUGFeRD processing
    for (const { pdfBuffer, orderId } of tempResults) {
      const iccPath = path.resolve(__dirname, "../routes/sRGB_v4_ICC_preference.icc");
      const tempInput = path.join(tmpDir, `${orderId}-input.pdf`);
      const tempOutput = path.join(tmpDir, `${orderId}-output.pdf`);
      fs.writeFileSync(tempInput, pdfBuffer);

      const gsExe = detectGhostscript();
      const gsArgs = [
        "-dPDFA=3","-dBATCH","-dNOPAUSE","-dNOOUTERSAVE","-sDEVICE=pdfwrite",
        "-dEmbedAllFonts=true","-dSubsetFonts=true","-dPreserveDocInfo=true","-dPreserveAnnots=true","-dPDFACompatibilityPolicy=1",
        "-dAutoRotatePages=/None","-sColorConversionStrategy=RGB","-dProcessColorModel=/DeviceRGB",
        "-dConvertCMYKImagesToRGB=true","-dDownsampleColorImages=false","-dDownsampleGrayImages=false","-dDownsampleMonoImages=false","-dPDFSETTINGS=/prepress",
        `-sOutputICCProfile=${iccPath}`, `-sOutputFile=${tempOutput}`, tempInput.replace(/\\/g,"/")
      ];
      await new Promise((resolve, reject) => execFile(gsExe, gsArgs, err => err ? reject(err) : resolve()));
      let finalPdf = fs.readFileSync(tempOutput);
      fs.unlinkSync(tempInput);

      if (user.plan === "pro") {
        const zugferdXml = generateZugferdXML({});
        const localeMeta = { title: 'Invoice', creator: 'PDFify', language: 'en' };
        finalPdf = await postProcessPdfStrict(finalPdf, zugferdXml, localeMeta, path.resolve(__dirname, "../server/xmp/zugferd.xmp"));
      }

      results.push({ pdfBuffer: finalPdf, orderId });
    }

    await user.save();
    await browser.close();

    if (results.length === 1) {
      const { pdfBuffer, orderId } = results[0];
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${orderId}.pdf"`,
        "Content-Length": pdfBuffer.length
      });
      return res.send(pdfBuffer);
    }

    const archive = archiver("zip", { zlib: { level: 9 } });
    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="invoices.zip"`
    });
    archive.pipe(res);
    results.forEach(({ pdfBuffer, orderId }) => archive.append(pdfBuffer, { name: `${orderId}.pdf` }));
    await archive.finalize();

  } catch (err) {
    console.error("❌ Exception in /generate-invoice:", err);
    if (browser) await browser.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  } finally {
    if (browser) await browser.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

module.exports = router;
