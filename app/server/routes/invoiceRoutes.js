const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const router = express.Router();
const fs = require("fs");
const archiver = require("archiver");
const User = require("../models/User");
const authenticate = require("../middleware/authenticate");
const dualAuth = require("../middleware/dualAuth");
const { generateZugferdXML } = require('../utils/zugferdHelper');
const { PDFDocument } = require("pdf-lib");
const { execSync, execFile } = require("child_process");
const { incrementUsage } = require("../utils/usageUtils");
const { postProcessPdfStrict } = require('../utils/postProcessPdfStrict');
const os = require("os");

const locales = {
  sl: require('../../locales/sl.json'),
  en: require('../../locales/en.json'),
  de: require('../../locales/de.json'),
};

const { generateInvoiceHTML: generateEnglishInvoice } = require("../../templates/english.js");
const FORCE_PLAN = process.env.FORCE_PLAN;

router.post("/generate-invoice", authenticate, dualAuth, async (req, res) => {
  console.log("🌐 /generate-invoice router hit");

  const iccPath = process.env.ICC_PROFILE_PATH || path.resolve(__dirname, "sRGB_v4_ICC_preference.icc");
  const gsIccPath = iccPath.replace(/\\/g, "/");

  console.log("🔍 Using ICC profile path:", iccPath);

  try {
    const gsVersion = execSync("gs --version").toString().trim();
    console.log("📦 Ghostscript version:", gsVersion);
  } catch (err) {
    console.error("❌ Ghostscript not found:", err.message);
    return res.status(500).json({ error: "Ghostscript not installed." });
  }

  if (!fs.existsSync(iccPath)) {
    console.error("❌ ICC profile not found at path:", iccPath);
    return res.status(500).json({ error: "ICC profile missing." });
  }

  let browser;
  const tmpDir = path.join(os.tmpdir(), `pdfify-batch-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    let requests = req.body.requests;
    if (!Array.isArray(requests)) {
      if (req.body.data) requests = [{ data: req.body.data, isPreview: req.body.isPreview }];
      else return res.status(400).json({ error: "You must send 1-100 requests." });
    }

    if (requests.length === 0 || requests.length > 100) {
      return res.status(400).json({ error: "You must send 1-100 requests." });
    }

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const now = new Date();
    if (!user.previewLastReset || now.getMonth() !== user.previewLastReset.getMonth() || now.getFullYear() !== user.previewLastReset.getFullYear()) {
      user.previewCount = 0; user.previewLastReset = now;
    }
    if (!user.usageLastReset || now.getMonth() !== user.usageLastReset.getMonth() || now.getFullYear() !== user.usageLastReset.getFullYear()) {
      user.usageCount = 0; user.usageLastReset = now;
    }

    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const results = [];

    for (const [index, { data, isPreview }] of requests.entries()) {
      if (!data || typeof data !== "object") {
        results.push({ error: "Invalid or missing data" });
        continue;
      }

      let invoiceData = { ...data };
      const country = (invoiceData.country || "slovenia").toLowerCase();
      invoiceData.country = country;

      function parseSafeNumber(value) {
        if (typeof value === "string") return parseFloat(value.replace(/[^\d.]/g, "")) || 0;
        return parseFloat(value) || 0;
      }

      if (country === "germany" && Array.isArray(invoiceData.items)) {
        invoiceData.items = invoiceData.items.map(item => {
          const totalNum = parseSafeNumber(item.total);
          const taxRate = 0.19;
          const net = totalNum / (1 + taxRate);
          const taxAmount = totalNum - net;
          return { ...item, tax: taxAmount.toFixed(2), net: net.toFixed(2) };
        });
      }

      invoiceData.taxRate = typeof invoiceData.taxRate === "number"
        ? `${(invoiceData.taxRate * 100).toFixed(0)}%`
        : invoiceData.taxRate || '21%';

      const supportedLocales = { slovenia: "sl", germany: "de" };
      invoiceData.locale = locales[supportedLocales[country] || "en"] || locales["en"];
      if (typeof invoiceData.items === "string") {
        try { invoiceData.items = JSON.parse(invoiceData.items); } catch { invoiceData.items = []; }
      }
      if (!Array.isArray(invoiceData.items)) invoiceData.items = [];

      if (!user.isPremium) { invoiceData.isBasicUser = true; invoiceData.customLogoUrl = null; invoiceData.showChart = false; }

      // --- Generate HTML + PDF via Puppeteer ---
      const html = generateEnglishInvoice({ ...invoiceData, isPreview });
      const page = await browser.newPage();
      await page.emulateMediaType('print');
      await page.evaluateOnNewDocument(() => document.documentElement.style.setProperty('--pdf-a-mode', 'true'));
      await page.setContent(html, { waitUntil: "networkidle0" });

      let pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "20mm", bottom: "20mm", left: "10mm", right: "10mm" },
        preferCSSPageSize: false,
        displayHeaderFooter: false,
        tagged: true,
        outline: false,
      });
      await page.close();

      // --- Count pages ---
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      const pageCount = pdfDoc.getPageCount();
      const usageAllowed = await incrementUsage(user, pageCount, isPreview, FORCE_PLAN);
      if (!usageAllowed) return res.status(403).json({ error: 'Monthly usage limit reached. Upgrade to premium for more pages.' });

      // --- Inject XMP/ZUGFeRD metadata BEFORE Ghostscript ---
      if (user.plan === "pro") {
        const zugferdXml = generateZugferdXML(invoiceData);
        const xmpPath = path.resolve(__dirname, "../xmp/zugferd.xmp");
        pdfBuffer = await postProcessPdfStrict(pdfBuffer, iccPath, xmpPath, zugferdXml);
      }

      // --- Ghostscript conversion (PDF/A-3b) ---
      const tempInput = path.join(tmpDir, `input-${index}.pdf`);
      const tempOutput = path.join(tmpDir, `output-${index}.pdf`);
      fs.writeFileSync(tempInput, pdfBuffer);

      const gsArgs = [
        "-dPDFA=3", "-dBATCH", "-dNOPAUSE", "-dNOOUTERSAVE", "-sDEVICE=pdfwrite",
        "-dUseCIEColor=true", "-dEmbedAllFonts=true", "-dSubsetFonts=true", "-dPreserveDocInfo=true",
        "-dPreserveAnnots=true", "-dShowAnnots=true", "-dPDFACompatibilityPolicy=1", "-dAutoRotatePages=/None",
        "-sColorConversionStrategy=RGB", "-dProcessColorModel=/DeviceRGB", "-dConvertCMYKImagesToRGB=true",
        "-dDownsampleColorImages=false", "-dDownsampleGrayImages=false", "-dDownsampleMonoImages=false",
        "-dPDFSETTINGS=/prepress",
        `-sOutputICCProfile=${gsIccPath}`, `-sOutputFile=${tempOutput}`, tempInput.replace(/\\/g, "/")
      ];

      await new Promise((resolve, reject) => {
        execFile("gs", gsArgs, { encoding: "utf-8" }, (err) => err ? reject(err) : resolve());
      });

      let finalPdf = fs.readFileSync(tempOutput);

      // --- Optional minimal tweaks AFTER Ghostscript ---
      if (user.plan === "pro") {
        finalPdf = await postProcessPdfStrict(finalPdf, iccPath, null, null);
      }

      results.push({ index, pdf: finalPdf });
    }

    if (results.length === 1) {
      res.set({ "Content-Type": "application/pdf", "Content-Disposition": `inline; filename=invoice.pdf`, "Content-Length": results[0].pdf.length });
      res.send(results[0].pdf);
    } else {
      const archive = archiver("zip", { zlib: { level: 9 } });
      res.set({ "Content-Type": "application/zip", "Content-Disposition": `attachment; filename=invoices.zip` });
      archive.pipe(res);
      results.forEach(({ index, pdf }) => archive.append(pdf, { name: `invoice-${index + 1}.pdf` }));
      await archive.finalize();
    }

    await user.save();
  } catch (e) {
    console.error("❌ Exception in /generate-invoice:", e);
    res.status(500).json({ error: "Internal Server Error", details: e.message });
  } finally {
    if (browser) await browser.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

module.exports = router;
