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

  const iccPath = process.env.ICC_PROFILE_PATH || path.resolve(__dirname, "sRGB_IEC61966-2-1_no_black_scaling.icc");
  const gsIccPath = iccPath.replace(/\\/g, "/");

  if (!fs.existsSync(iccPath)) {
    console.error("❌ ICC profile missing at path:", iccPath);
    return res.status(500).json({ error: "ICC profile missing." });
  }

  let browser;
  const tmpDir = path.join(os.tmpdir(), `pdfify-batch-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    let requests = Array.isArray(req.body.requests) ? req.body.requests : req.body.data ? [{ data: req.body.data, isPreview: req.body.isPreview }] : [];
    if (!requests.length || requests.length > 100) return res.status(400).json({ error: "You must send 1-100 requests." });

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const results = [];

    for (const [index, { data, isPreview }] of requests.entries()) {
      if (!data || typeof data !== "object") {
        results.push({ error: "Invalid or missing data" });
        continue;
      }

      // --- Prepare invoice data ---
      let invoiceData = { ...data };
      const country = (invoiceData.country || "slovenia").toLowerCase();
      invoiceData.country = country;
      invoiceData.locale = locales[{ slovenia: "sl", germany: "de" }[country] || "en"] || locales["en"];
      if (!Array.isArray(invoiceData.items)) invoiceData.items = typeof invoiceData.items === "string" ? JSON.parse(invoiceData.items || "[]") : [];

      // --- Puppeteer PDF ---
      const html = generateEnglishInvoice({ ...invoiceData, isPreview });
      const page = await browser.newPage();
      await page.emulateMediaType('print');
      await page.evaluateOnNewDocument(() => document.documentElement.style.setProperty('--pdf-a-mode', 'true'));
      await page.setContent(html, { waitUntil: "networkidle0" });

      let pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "20mm", bottom: "20mm", left: "10mm", right: "10mm" },
        displayHeaderFooter: false,
        tagged: true,
      });
      await page.close();

      // --- Pre-Ghostscript: Inject XMP/ZUGFeRD ---
      if (user.plan === "pro") {
        const zugferdXml = generateZugferdXML(invoiceData);
        const xmpPath = path.resolve(__dirname, "../xmp/zugferd.xmp");
        pdfBuffer = await postProcessPdfStrict(pdfBuffer, iccPath, xmpPath, zugferdXml);
      }

      // --- Temporary files for Ghostscript ---
      const tempInput = path.join(tmpDir, `input-${index}.pdf`);
      const tempOutput = path.join(tmpDir, `output-${index}.pdf`);
      fs.writeFileSync(tempInput, pdfBuffer);

      // --- Ghostscript PDF/A-3b conversion ---
      const gsArgs = [
        "-dPDFA=3", "-dBATCH", "-dNOPAUSE", "-dNOOUTERSAVE", "-sDEVICE=pdfwrite",
        "-dUseCIEColor=true", "-dEmbedAllFonts=true", "-dSubsetFonts=true",
        "-dPreserveDocInfo=true", "-dPDFACompatibilityPolicy=1",
        `-sOutputICCProfile=${gsIccPath}`,
        `-sOutputFile=${tempOutput}`,
        tempInput.replace(/\\/g, "/")
      ];

      await new Promise((resolve, reject) => {
        execFile("gs", gsArgs, { encoding: "utf-8" }, (err, stdout, stderr) => err ? reject(err) : resolve());
      });

      const finalPdf = fs.readFileSync(tempOutput);
      results.push({ index, pdf: finalPdf });
    }

    // --- Return result ---
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
