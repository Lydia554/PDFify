const express = require("express");
const puppeteer = require("puppeteer");
const archiver = require("archiver");
const fetch = require("node-fetch");
if (!globalThis.fetch) globalThis.fetch = fetch;

const router = express.Router();
const User = require("../models/User");
const authenticate = require("../middleware/authenticate");
const dualAuth = require("../middleware/dualAuth");
const { incrementUsage } = require("../utils/usageUtils");
const { generateInvoiceHTML } = require("../../templates/english.js");
const { generateInvoiceHTMLPro } = require("../../templates/english-pro-compliant.js");
const { generateZugferdXML, embedXmp, embedXmlIntoPdf, makePdfA3b } = require("../Helpers/pdf-helpers");

const locales = {
  sl: require("../../locales/sl.json"),
  en: require("../../locales/en.json"),
  de: require("../../locales/de.json"),
};

const FORCE_PLAN = process.env.FORCE_PLAN;
const DEBUG_MODE = process.env.DEBUG_MODE === "true";

const log = (message, meta = {}) => console.log("[InvoiceRoute]", message, meta);

// -----------------------------
// PDF generation helper
// -----------------------------
async function generatePdf(invoiceData, user, browser, reqInvoiceSource) {
  const PDFLib = require("pdf-lib");
  const page = await browser.newPage();

  await page.setViewport({ width: 1200, height: 1600 });
  await page.emulateMediaType("print");

  // Source + plan flags
  invoiceData.invoiceSource ||= reqInvoiceSource || "standard";
  invoiceData.isFreeUser = user.planType === "free";

  // Choose correct HTML template
  let html;
  try {
    if (user.planType === "pro" && invoiceData.compliant) {
      html = await generateInvoiceHTMLPro(invoiceData); // black & white compliant
    } else {
      html = await generateInvoiceHTML(invoiceData); // colorful standard
    }
  } catch (err) {
    throw new Error(`Error generating HTML: ${err.message}`);
  }

  await page.setContent(html, { waitUntil: "load", timeout: 15000 });
  await page.evaluateHandle("document.fonts.ready");

  let pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "20mm", bottom: "20mm", left: "10mm", right: "10mm" },
    displayHeaderFooter: true,
    headerTemplate: `<div></div>`,
    footerTemplate: `<div style="width:100%; font-size:10px; color:#2a3d66; text-align:center; font-family:Arial,sans-serif;">
      Page <span class="pageNumber"></span> of <span class="totalPages"></span>
    </div>`,
    preferCSSPageSize: true,
  });

  await page.close();

  const pdfDoc = await PDFLib.PDFDocument.load(pdfBuffer);
  const pageCount = pdfDoc.getPageCount();

  // Only run this for Pro users + compliant toggle
  if (user.planType === "pro" && invoiceData.compliant) {
    const pdfDocPro = await PDFLib.PDFDocument.load(pdfBuffer);
    const zugferdXml = generateZugferdXML(invoiceData);
    await embedXmp(pdfDocPro);
    embedXmlIntoPdf(pdfDocPro, zugferdXml);
    pdfBuffer = await pdfDocPro.save();

    // Add ICC profile via Ghostscript (PDF/A-3b)
    if (!DEBUG_MODE) {
      const iccPath = require("path").join(__dirname, "sRGB_v4_ICC_preference.icc");
      pdfBuffer = await makePdfA3b(pdfBuffer, { iccProfilePath: iccPath });
    }
  }

  return { pdfBuffer, pageCount };
}

// -----------------------------
// /generate-invoice route
// -----------------------------
router.post("/generate-invoice", authenticate, dualAuth, async (req, res) => {
  let browser;

  try {
    const requests = req.body.requests || [
      { data: req.body.data, isPreview: req.body.isPreview, compliant: !!req.body.compliant },
    ];
    if (!requests.length) return res.status(400).json({ error: "No requests provided." });

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const results = [];
    let totalPages = 0;

    for (const reqItem of requests) {
      const invoiceData = { ...reqItem.data };
      invoiceData.isFreeUser = user.planType === "free";
      invoiceData.compliant = !!reqItem.compliant;
      invoiceData.invoiceSource = reqItem.data.invoiceSource || req.invoiceSource || "standard";

      // Locale handling
      const country = (invoiceData.country || "").toLowerCase();
      const lang =
        invoiceData.invoiceLanguage ||
        (country === "germany"
          ? "de"
          : country === "slovenia"
          ? "sl"
          : "en");
      invoiceData.locale = locales[lang] || locales["en"];

      const orderId =
        invoiceData.orderId ||
        `order-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      const { pdfBuffer, pageCount } = await generatePdf(
        invoiceData,
        user,
        browser,
        invoiceData.invoiceSource
      );

      results.push({ pdfBuffer, orderId });
      totalPages += pageCount;
    }

    await browser.close();

    if (!requests[0]?.isPreview) {
      const allowed = await incrementUsage(user, totalPages, false, FORCE_PLAN);
      if (!allowed) throw new Error("Monthly limit reached.");
    }
    await user.save();

    // Single PDF or ZIP
    if (results.length === 1) {
      const { pdfBuffer, orderId } = results[0];
      const isPreview = requests[0].isPreview;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        isPreview
          ? `inline; filename="${orderId}.pdf"`
          : `attachment; filename="${orderId}.pdf"`
      );
      res.setHeader("Content-Length", pdfBuffer.length);
      return res.end(pdfBuffer);
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="invoices.zip"`);
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);
    results.forEach(({ pdfBuffer, orderId }) =>
      archive.append(pdfBuffer, { name: `${orderId}.pdf` })
    );
    await archive.finalize();
    log("ZIP archive sent", { count: results.length });
  } catch (err) {
    if (browser) await browser.close();
    log("Error in /generate-invoice", { error: err.message });
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

module.exports = router;
