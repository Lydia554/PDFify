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

// Clean generatePdf function
async function generatePdf(invoiceData, user, browser) {
  const PDFLib = require("pdf-lib");
  const page = await browser.newPage();
  await page.emulateMediaType('print');

  invoiceData.userClass = user.plan === "pro" ? "pdfa-clean" : "";
  if (user.plan === "free" && !invoiceData.customLogoUrl) {
    invoiceData.customLogoUrl = path.resolve(__dirname, "../../public/images/Logo.png");
  }

  const html = await generateInvoiceHTML(invoiceData);
  await page.setContent(html, { waitUntil: "networkidle2", timeout: 30000 });

  let pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "20mm", bottom: "20mm", left: "10mm", right: "10mm" },
    displayHeaderFooter: false
  });

  await page.close();

  // Count pages and increment usage
  const pdfDoc = await PDFLib.PDFDocument.load(pdfBuffer);
  const pageCount = pdfDoc.getPageCount();

  const usageAllowed = await incrementUsage(user, pageCount, invoiceData.isPreview, FORCE_PLAN);
  if (!usageAllowed) throw new Error('Monthly limit reached.');

  // Pro embedding
  if (user.plan === "pro") {
    const pdfDocPro = await PDFLib.PDFDocument.load(pdfBuffer);
    const zugferdXml = generateZugferdXML(invoiceData);
    await embedIccProfile(pdfDocPro);
    await embedXmp(pdfDocPro);
    embedXmlIntoPdf(pdfDocPro, zugferdXml);
    pdfBuffer = await pdfDocPro.save();
  }

  return { pdfBuffer, pageCount };
}

// Route
router.post("/generate-invoice", authenticate, dualAuth, async (req, res) => {
  const tmpDir = path.join(os.tmpdir(), `pdfify-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  let browser;
  try {
    const requests = req.body.requests || [{ data: req.body.data, isPreview: req.body.isPreview }];
    if (!requests.length) return res.status(400).json({ error: "No requests provided." });

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const results = [];

    for (const { data: invoiceDataRaw, isPreview } of requests) {
      const invoiceData = { ...invoiceDataRaw, isPreview };

      // Add IBAN/BIC support
      invoiceData.iban = invoiceData.iban || "";
      invoiceData.bic = invoiceData.bic || "";

      // Ensure country/lang logic
      const country = (invoiceData.country || "").toLowerCase();
      const lang = invoiceData.invoiceLanguage || (country === "germany" ? "de" : country === "slovenia" ? "sl" : "en");
      invoiceData.locale = locales[lang] || locales["en"];

      const orderId = invoiceData.orderId || `order-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      const { pdfBuffer, pageCount } = await generatePdf(invoiceData, user, browser);
      results.push({ pdfBuffer, orderId });
      console.log(`📄 Invoice ${orderId} generated with ${pageCount} page(s).`);
    }

    await user.save();
    await browser.close();

    // Single invoice
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

      return res.send(pdfBuffer);
    }

    // Multiple PDFs => ZIP
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
