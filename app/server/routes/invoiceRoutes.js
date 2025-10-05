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
 
  console.log("[InvoiceRoute]", message, meta);
};

// -----------------------------
// PDF generation helper
// -----------------------------
async function generatePdf(invoiceData, user, browser, reqInvoiceSource) {
  const PDFLib = require("pdf-lib");
  log("🧾 Starting PDF generation", { planType: user.planType, compliant: invoiceData.compliant });

  const page = await browser.newPage();

  // 🧩 Hook into Puppeteer console and errors
  page.on("console", msg => {
    const type = msg.type();
    log(`[Puppeteer Console:${type}]`, { text: msg.text() });
  });
  page.on("pageerror", err => log("[Puppeteer PageError]", { message: err.message, stack: err.stack }));
  page.on("requestfailed", req => log("[Puppeteer RequestFailed]", { url: req.url(), error: req.failure()?.errorText }));

  // Explicit viewport and media type
  await page.setViewport({ width: 1200, height: 1600 });
  await page.emulateMediaType("print");

  const useCompliant = user.planType === "pro" && invoiceData.compliant === true;
  invoiceData.userClass = useCompliant ? "pdfa-clean" : "";

  // Source tracking
  invoiceData.invoiceSource ||= reqInvoiceSource || "standard";
  log("📦 Invoice source determined", { invoiceSource: invoiceData.invoiceSource });

  // Default logo
  if (user.planType === "free" && !invoiceData.customLogoUrl) {
    invoiceData.customLogoUrl = path.resolve(__dirname, "../../public/images/Logo.png");
    log("🖼️ Default logo set for free user", { logo: invoiceData.customLogoUrl });
  }

  // HTML generation
  let html;
  try {
    html = useCompliant
      ? await generateInvoiceHTMLPro(invoiceData)
      : await generateInvoiceHTML(invoiceData);
    log("✅ HTML generated", { htmlLength: html.length });
  } catch (err) {
    log("❌ Error generating HTML", { error: err.message, stack: err.stack });
    throw err;
  }

  // Load content into Puppeteer
  try {
    log("🧠 Setting page content...");
    await page.setContent(html, { waitUntil: ["load", "domcontentloaded", "networkidle0"], timeout: 45000 });
    await page.evaluateHandle("document.fonts.ready");
    const contentHTML = await page.content();
    log("📄 Page content length", { length: contentHTML.length });
  } catch (err) {
    log("❌ Error setting page content", { error: err.message, stack: err.stack });
    throw err;
  }

  // Screenshot sanity check (to see if it renders visually)
  try {
    const screenshotPath = path.join(os.tmpdir(), `preview-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    log("📸 Screenshot captured for debug", { path: screenshotPath });
  } catch (err) {
    log("⚠️ Screenshot failed", { error: err.message });
  }

  // PDF generation
  let pdfBuffer;
  try {
    log("🖨️ Generating PDF with Puppeteer...");
    pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", bottom: "20mm", left: "10mm", right: "10mm" },
      displayHeaderFooter: false,
      preferCSSPageSize: true
    });
    log("📦 PDF buffer created", { size: pdfBuffer.length });
  } catch (err) {
    log("❌ PDF generation error", { error: err.message, stack: err.stack });
    throw err;
  } finally {
    await page.close();
  }

  // Count pages
  const PDFDocument = await PDFLib.PDFDocument.load(pdfBuffer);
  const pageCount = PDFDocument.getPageCount();
  log("📑 PDF page count", { pageCount });

  // Increment usage
  const usageAllowed = await incrementUsage(user, pageCount, invoiceData.isPreview, FORCE_PLAN);
  if (!usageAllowed) throw new Error("Monthly limit reached.");

  // Optional compliant processing
  if (useCompliant) {
    try {
      const isStandardInvoice = invoiceData.invoiceSource === "standard";
      log("🧩 Compliant check", { useCompliant, invoiceSource: invoiceData.invoiceSource, isStandardInvoice });

      if (isStandardInvoice) {
        const pdfDocPro = await PDFLib.PDFDocument.load(pdfBuffer);
        const zugferdXml = generateZugferdXML(invoiceData);
        log("🔧 Generated ZUGFeRD XML", { length: zugferdXml.length });

        await embedIccProfile(pdfDocPro);
        await embedXmp(pdfDocPro);
        embedXmlIntoPdf(pdfDocPro, zugferdXml);

        pdfBuffer = await pdfDocPro.save();
        log("💾 Saved PDF after embedding XML", { newSize: pdfBuffer.length });

        if (!DEBUG_MODE) {
          const metadata = {};
          pdfBuffer = await makePdfA3b(pdfBuffer, metadata);
          log("✅ PDF/A-3b conversion done", { metadata });
        }
      } else {
        log("⏩ Skipping ZUGFeRD/PDF-A for non-standard invoice", { invoiceSource: invoiceData.invoiceSource });
      }
    } catch (err) {
      log("❌ Error in compliant PDF processing", { error: err.message, stack: err.stack });
      throw err;
    }
  }

  log("🏁 PDF generation complete", { pageCount, useCompliant, invoiceSource: invoiceData.invoiceSource });
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

      // <-- pass req.invoiceSource here -->
      const { pdfBuffer, pageCount } = await generatePdf(invoiceData, user, browser, req.invoiceSource);
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
