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
const { generateInvoiceHTML } = require("../../templates/english.js");
const { generateZugferdXML, embedXmp, embedIccProfile, embedXmlIntoPdf } = require("../Helpers/pdf-helpers");

const locales = {
  sl: require('../../locales/sl.json'),
  en: require('../../locales/en.json'),
  de: require('../../locales/de.json'),
};

const FORCE_PLAN = process.env.FORCE_PLAN;

// -----------------------------
// PDF generation helper with logging
// -----------------------------
async function generatePdf(invoiceData, user, browser) {
  const PDFLib = require("pdf-lib");
  console.log("[PDF] Starting PDF generation for order:", invoiceData.orderId);

  const page = await browser.newPage();
  await page.emulateMediaType('print');

  invoiceData.userClass = user.plan === "pro" ? "pdfa-clean" : "";
  if (user.plan === "free" && !invoiceData.customLogoUrl) {
    invoiceData.customLogoUrl = path.resolve(__dirname, "../../public/images/Logo.png");
    console.log("[PDF] Using default logo for free user:", invoiceData.customLogoUrl);
  }

  // Generate HTML
  const html = await generateInvoiceHTML(invoiceData);
  console.log("[PDF] Generated HTML for order:", invoiceData.orderId, "\n", html.substring(0, 500), "..."); // log first 500 chars

  // Set page content
  await page.setContent(html, { waitUntil: "networkidle2", timeout: 30000 });
  console.log("[PDF] HTML content set in Puppeteer page.");

  // Generate PDF buffer
  let pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "20mm", bottom: "20mm", left: "10mm", right: "10mm" },
    displayHeaderFooter: false
  });
  console.log("[PDF] PDF buffer generated, size:", pdfBuffer.length);

  await page.close();

  // Count pages
  const pdfDoc = await PDFLib.PDFDocument.load(pdfBuffer);
  const pageCount = pdfDoc.getPageCount();
  console.log(`[PDF] Loaded PDF with ${pageCount} page(s)`);

  // Increment usage
  const usageAllowed = await incrementUsage(user, pageCount, invoiceData.isPreview, FORCE_PLAN);
  if (!usageAllowed) throw new Error('Monthly limit reached.');

  // Pro embedding
  if (user.plan === "pro") {
    console.log("[PDF] Embedding ICC, XMP, ZUGFeRD XML for PRO user.");
    const pdfDocPro = await PDFLib.PDFDocument.load(pdfBuffer);
    const zugferdXml = generateZugferdXML(invoiceData);
    await embedIccProfile(pdfDocPro);
    await embedXmp(pdfDocPro);
    embedXmlIntoPdf(pdfDocPro, zugferdXml);
    pdfBuffer = await pdfDocPro.save();
    console.log("[PDF] PRO PDF embedding completed, new size:", pdfBuffer.length);
  }


      // 3️⃣ ⬇️ PUT YOUR DEBUG CHECK **HERE**
    if (user.plan === "pro") {
      if (process.env.DEBUG_MODE === "true") {
        console.log("⚠️ Skipping PDF/A-3b enforcement for debugging.");
      } else {
        console.log("[PDF] Enforcing PDF/A-3b compliance for PRO user.");
        pdfBuffer = await makePdfA3b(pdfBuffer, metadata);
      }
    }

  return { pdfBuffer, pageCount };
}

// -----------------------------
// /generate-invoice route
// -----------------------------
router.post("/generate-invoice", authenticate, dualAuth, async (req, res) => {
  const tmpDir = path.join(os.tmpdir(), `pdfify-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  console.log("[Route] Temporary directory created:", tmpDir);

  let browser;
  try {
    const requests = req.body.requests || [{ data: req.body.data, isPreview: req.body.isPreview }];
    if (!requests.length) return res.status(400).json({ error: "No requests provided." });

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    console.log("[Route] User loaded:", user.email, "Plan:", user.plan);

    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    console.log("[Route] Puppeteer launched.");

    const results = [];

    for (const { data: invoiceDataRaw, isPreview } of requests) {
      const invoiceData = { ...invoiceDataRaw, isPreview };
      invoiceData.iban = invoiceData.iban || "";
      invoiceData.bic = invoiceData.bic || "";

      const country = (invoiceData.country || "").toLowerCase();
      const lang = invoiceData.invoiceLanguage || (country === "germany" ? "de" : country === "slovenia" ? "sl" : "en");
      invoiceData.locale = locales[lang] || locales["en"];
      const orderId = invoiceData.orderId || `order-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      console.log("[Route] Preparing PDF for order:", orderId, "Locale:", lang);
      const { pdfBuffer, pageCount } = await generatePdf(invoiceData, user, browser);
      console.log(`[Route] PDF for order ${orderId} generated with ${pageCount} page(s), size: ${pdfBuffer.length}`);

      results.push({ pdfBuffer, orderId });
    }

    await user.save();
    console.log("[Route] User usage updated.");

    await browser.close();
    console.log("[Route] Puppeteer closed.");

    // Single invoice
    if (results.length === 1) {
      const { pdfBuffer, orderId } = results[0];
      const isPreview = requests[0].isPreview;
      console.log("[Route] Sending single PDF:", orderId, "Preview:", isPreview);

      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": isPreview
          ? `inline; filename="${orderId}.pdf"`
          : `attachment; filename="${orderId}.pdf"`,
        "Content-Length": pdfBuffer.length
      });

      return res.send(pdfBuffer);
    }

    // Multiple PDFs => ZIP
    console.log("[Route] Multiple PDFs, generating ZIP...");
    const archive = archiver("zip", { zlib: { level: 9 } });
    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="invoices.zip"`
    });
    archive.pipe(res);
    results.forEach(({ pdfBuffer, orderId }) => archive.append(pdfBuffer, { name: `${orderId}.pdf` }));
    await archive.finalize();
    console.log("[Route] ZIP archive sent.");

  } catch (err) {
    console.error("❌ Exception in /generate-invoice:", err);
    if (browser) await browser.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  } finally {
    if (browser) await browser.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log("[Route] Temporary directory cleaned up:", tmpDir);
  }
});

module.exports = router;
