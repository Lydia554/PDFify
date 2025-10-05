const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const os = require("os");
const archiver = require("archiver");

const router = express.Router();

const User = require("../models/User");
const authenticate = require("../middleware/authenticate");
const dualAuth = require("../middleware/dualAuth");
const { incrementUsage } = require("../utils/usageUtils");
const { generateInvoiceHTML } = require("../../templates/english.js"); // free template
const { generateInvoiceHTMLPro } = require("../../templates/english-pro-compliant.js"); // pro compliant
const { generateZugferdXML, embedXmp, embedIccProfile, embedXmlIntoPdf, makePdfA3b } = require("../Helpers/pdf-helpers");

const locales = {
  sl: require('../../locales/sl.json'),
  en: require('../../locales/en.json'),
  de: require('../../locales/de.json'),
};

const FORCE_PLAN = process.env.FORCE_PLAN;
const DEBUG_MODE = process.env.DEBUG_MODE === "true";

const log = (message, meta = {}) => {
  // Replace with Graylog logger if you have one; here we just console.log
  console.log("[InvoiceRoute]", message, meta);
};

// -----------------------------
// PDF generation helper
// -----------------------------
async function generatePdf(invoiceData, user, browser) {
  const PDFLib = require("pdf-lib");
  log("Starting PDF generation", { invoiceData, planType: user.planType });

  const page = await browser.newPage();
  await page.emulateMediaType('print');

  const useCompliant = user.planType === "pro" && invoiceData.compliant === true;
  invoiceData.userClass = useCompliant ? "pdfa-clean" : "";

  log("Using template", { useCompliant });

  if (user.planType === "free" && !invoiceData.customLogoUrl) {
    invoiceData.customLogoUrl = path.resolve(__dirname, "../../public/images/Logo.png");
    log("Set default logo for free user", { logo: invoiceData.customLogoUrl });
  }

  const html = useCompliant
    ? await generateInvoiceHTMLPro(invoiceData)
    : await generateInvoiceHTML(invoiceData);

  log("HTML generated for PDF", { length: html.length });

  await page.setContent(html, { waitUntil: "networkidle2", timeout: 30000 });

  let pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "20mm", bottom: "20mm", left: "10mm", right: "10mm" },
    displayHeaderFooter: false
  });

  await page.close();

  const pdfDoc = await PDFLib.PDFDocument.load(pdfBuffer);
  const pageCount = pdfDoc.getPageCount();
  log("PDF page count", { pageCount });

  const usageAllowed = await incrementUsage(user, pageCount, invoiceData.isPreview, FORCE_PLAN);
  if (!usageAllowed) {
    log("Usage limit reached", { userId: user._id });
    throw new Error('Monthly limit reached.');
  }

if (useCompliant) {
  try {
    // Only generate ZUGFeRD if the invoice source is standard (not colorful)
    const isStandardInvoice = invoiceData.invoiceSource === "standard";
    log("Compliant check", { useCompliant, invoiceSource: invoiceData.invoiceSource, isStandardInvoice });

    if (isStandardInvoice) {
      const pdfDocPro = await PDFLib.PDFDocument.load(pdfBuffer);

      const zugferdXml = generateZugferdXML(invoiceData);
      log("Generated ZUGFeRD XML", { length: zugferdXml.length });

      await embedIccProfile(pdfDocPro);
      log("ICC profile embedded");

      await embedXmp(pdfDocPro);
      log("XMP metadata embedded");

      embedXmlIntoPdf(pdfDocPro, zugferdXml);
      log("ZUGFeRD XML embedded into PDF");

      pdfBuffer = await pdfDocPro.save();
      log("PDF saved after ZUGFeRD embedding", { size: pdfBuffer.length });

      if (!DEBUG_MODE) {
        const metadata = {};
        pdfBuffer = await makePdfA3b(pdfBuffer, metadata);
        log("PDF/A-3b conversion done", { metadata });
      }
    } else {
      log("Skipping ZUGFeRD and PDF/A for non-standard invoice (e.g., colorful)", { invoiceSource: invoiceData.invoiceSource });
    }
  } catch (err) {
    log("Error in compliant PDF processing", { error: err.message, stack: err.stack });
    throw err; // bubble up to route handler
  }
}

log("PDF generation complete", { pageCount, useCompliant, invoiceSource: invoiceData.invoiceSource });
return { pdfBuffer, pageCount };
}

// -----------------------------
// /generate-invoice route
// -----------------------------
router.post("/generate-invoice", authenticate, dualAuth, async (req, res) => {
  const tmpDir = path.join(os.tmpdir(), `pdfify-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  let browser;
  log("Request received", { body: req.body, userId: req.user.userId });

  try {
    const requests = req.body.requests || [{ data: req.body.data, isPreview: req.body.isPreview }];
    if (!requests.length) return res.status(400).json({ error: "No requests provided." });

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const results = [];

    for (const { data: invoiceDataRaw, isPreview, compliant } of requests) {
      const invoiceData = { ...invoiceDataRaw, isPreview, compliant: !!compliant };

      invoiceData.iban ||= "";
      invoiceData.bic ||= "";

      const country = (invoiceData.country || "").toLowerCase();
      const lang = invoiceData.invoiceLanguage || (country === "germany" ? "de" : country === "slovenia" ? "sl" : "en");
      invoiceData.locale = locales[lang] || locales["en"];
      const orderId = invoiceData.orderId || `order-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      log("Processing invoice", { orderId, invoiceData });

      const { pdfBuffer, pageCount } = await generatePdf(invoiceData, user, browser);
      results.push({ pdfBuffer, orderId, pageCount, useCompliant: invoiceData.compliant });
      log("Invoice processed", { orderId, pageCount, compliant: invoiceData.compliant });
    }

    await user.save();
    await browser.close();

    if (results.length === 1) {
      const { pdfBuffer, orderId } = results[0];
      const isPreview = requests[0].isPreview;

      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": isPreview
          ? `inline; filename="${orderId}.pdf"`
          : `attachment; filename="${orderId}.pdf"`,
        "Content-Length": pdfBuffer.length
      });

      log("Sending single PDF", { orderId, length: pdfBuffer.length });
      return res.send(pdfBuffer);
    }

    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="invoices.zip"`
    });

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);

    results.forEach(({ pdfBuffer, orderId }) => {
      archive.append(pdfBuffer, { name: `${orderId}.pdf` });
    });

    await archive.finalize();
    log("ZIP archive sent", { count: results.length });

  } catch (err) {
    if (browser) await browser.close();
    log("Error in /generate-invoice", { error: err.message, stack: err.stack });
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  } finally {
    if (browser) await browser.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    log("Temporary files cleaned up", { tmpDir });
  }
});

module.exports = router;
