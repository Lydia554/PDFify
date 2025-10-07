const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const os = require("os");
const archiver = require("archiver");
const fetch = require("node-fetch");
if (!globalThis.fetch) globalThis.fetch = fetch;

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

const log = (message, meta = {}) => console.log("[InvoiceRoute]", message, meta);

// -----------------------------
// PDF generation helper
// -----------------------------
async function generatePdf(invoiceData, user, browser, reqInvoiceSource) {
  const PDFLib = require("pdf-lib");
  log("🧾 Starting PDF generation", { planType: user.planType, compliant: invoiceData.compliant });

  const page = await browser.newPage();

  // Puppeteer console/network logging
  page.on("console", msg => log(`[Puppeteer Console:${msg.type()}]`, { text: msg.text() }));
  page.on("pageerror", err => log("[Puppeteer PageError]", { message: err.message, stack: err.stack }));
  page.on("requestfailed", req => log("[Puppeteer RequestFailed]", { url: req.url(), error: req.failure()?.errorText }));

  await page.setViewport({ width: 1200, height: 1600 });
  await page.emulateMediaType("print");

  invoiceData.invoiceSource ||= reqInvoiceSource || "standard";

  // Handle logo as base64 if present
  if (invoiceData.customLogoUrl && invoiceData.customLogoUrl !== "example.png") {
    try {
      const isSvg = invoiceData.customLogoUrl.endsWith(".svg");
      const mime = isSvg ? "image/svg+xml" : "image/png";
      const resp = await fetch(invoiceData.customLogoUrl);
      const buffer = await resp.arrayBuffer();
      const base64Logo = Buffer.from(buffer).toString("base64");
      invoiceData.customLogoUrl = `data:${mime};base64,${base64Logo}`;
      log("✅ Logo embedded as base64", { length: invoiceData.customLogoUrl.length });
    } catch (err) {
      log("⚠️ Failed to fetch custom logo", { error: err.message });
      invoiceData.customLogoUrl = null;
    }
  } else if (user.planType === "free") {
    invoiceData.customLogoUrl = path.resolve(__dirname, "../../public/images/Logo.png");
    log("🖼️ Default logo set for free user", { logo: invoiceData.customLogoUrl });
  } else {
    invoiceData.customLogoUrl = null;
  }

  // Generate HTML
  let html;
  try {
    html = user.planType === "pro" && invoiceData.compliant
      ? await generateInvoiceHTMLPro(invoiceData)
      : await generateInvoiceHTML(invoiceData);
    log("✅ HTML generated", { htmlLength: html.length });
    log("📄 HTML snippet", { snippet: html.slice(0, 500) });
  } catch (err) {
    log("❌ Error generating HTML", { error: err.message, stack: err.stack });
    throw err;
  }

  // Load HTML into Puppeteer
  try {
    await page.setContent(html, { waitUntil: "load", timeout: 15000 });

    await page.evaluateHandle("document.fonts.ready");
    log("🧠 Page content loaded");
  } catch (err) {
    log("❌ Error setting page content", { error: err.message, stack: err.stack });
    throw err;
  }

  // Generate PDF
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
  try {
    const PDFDocument = await PDFLib.PDFDocument.load(pdfBuffer);
    const pageCount = PDFDocument.getPageCount();
    log("📑 PDF page count", { pageCount });
  } catch (err) {
    log("❌ PDF inspection failed", { error: err.message });
  }

  // Increment usage
  const usageAllowed = await incrementUsage(user, invoiceData.isPreview ? 0 : 1, invoiceData.isPreview, FORCE_PLAN);
  if (!usageAllowed) throw new Error("Monthly limit reached.");

  // Optional compliant processing
  if (user.planType === "pro" && invoiceData.compliant) {
    try {
      const pdfDocPro = await PDFLib.PDFDocument.load(pdfBuffer);
      const zugferdXml = generateZugferdXML(invoiceData);
      log("🔧 Generated ZUGFeRD XML", { length: zugferdXml.length });

      await embedIccProfile(pdfDocPro);
      await embedXmp(pdfDocPro);
      embedXmlIntoPdf(pdfDocPro, zugferdXml);

      pdfBuffer = await pdfDocPro.save();
      log("💾 PDF saved after embedding XML", { newSize: pdfBuffer.length });

      if (!DEBUG_MODE) {
        const metadata = {};
        pdfBuffer = await makePdfA3b(pdfBuffer, metadata);
        log("✅ PDF/A-3b conversion done", { metadata });
      }
    } catch (err) {
      log("❌ Error in compliant PDF processing", { error: err.message, stack: err.stack });
      throw err;
    }
  }

  log("🏁 PDF generation complete", { invoiceSource: invoiceData.invoiceSource });
  return { pdfBuffer };
}

// -----------------------------
// /generate-invoice route
// -----------------------------
router.post("/generate-invoice", authenticate, dualAuth, async (req, res) => {
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

      const { pdfBuffer } = await generatePdf(invoiceData, user, browser, req.invoiceSource);
      results.push({ pdfBuffer, orderId });
      log("Invoice processed", { orderId });
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
      res.end(pdfBuffer);
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
  }
});

module.exports = router;
