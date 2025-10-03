const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const os = require("os");
const archiver = require("archiver");
const csvParse = require("csv-parse/lib/sync");
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

router.post("/generate-invoice", authenticate, dualAuth, async (req, res) => {
  const tmpDir = path.join(os.tmpdir(), `pdfify-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  let browser;
  try {
    let requests = [];

    // --- CSV support ---
    if (req.body.csv) {
      const rows = csvParse(req.body.csv, { columns: true, skip_empty_lines: true, trim: true });
      requests = rows.map(row => ({ data: row, isPreview: false }));
    } else {
      requests = req.body.requests || [{ data: req.body.data, isPreview: req.body.isPreview }];
    }

    if (!requests.length) return res.status(400).json({ error: "No requests provided." });

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
    const results = [];

    for (const { data: invoiceDataRaw, isPreview } of requests) {
      const invoiceData = { ...invoiceDataRaw };
      const orderId = invoiceData.orderId || `order-${Date.now()}`;
      const country = (invoiceData.country || "").toLowerCase();
      const lang = invoiceData.invoiceLanguage || (country === "germany" ? "de" : country === "slovenia" ? "sl" : "en");
      invoiceData.country = country || "default";
      invoiceData.locale = locales[lang] || locales["en"];

      // Germany VAT logic
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

      // User class / logo
      invoiceData.userClass = user.plan === "pro" ? "pdfa-clean" : "";
      if (user.plan === "free") invoiceData.customLogoUrl = path.resolve(__dirname, "../../public/images/Logo.png");

      const html = await generateInvoiceHTML({ ...invoiceData, isPreview });
      await page.setContent(html, { waitUntil: "networkidle0", timeout: 0 });

      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "20mm", bottom: "20mm", left: "10mm", right: "10mm" },
        displayHeaderFooter: false,
        tagged: true
      });
      await page.close();

      // Count pages
      const PDFLib = require("pdf-lib");
      const pdfDoc = await PDFLib.PDFDocument.load(pdfBuffer);
      const pageCount = pdfDoc.getPageCount();

      // Increment usage
      const usageAllowed = await incrementUsage(user, pageCount, false, FORCE_PLAN);
      if (!usageAllowed) {
        await browser.close();
        fs.rmSync(tmpDir, { recursive: true, force: true });
        return res.status(403).json({ error: 'Monthly limit reached.' });
      }

      let finalPdf = pdfBuffer;

      // Pro users: embed ICC, XMP, and ZUGFeRD
      if (user.plan === "pro") {
        const zugferdXml = generateZugferdXML(invoiceData);
        const pdfDocPro = await PDFLib.PDFDocument.load(pdfBuffer);

        await embedIccProfile(pdfDocPro);
        await embedXmp(pdfDocPro);
        embedXmlIntoPdf(pdfDocPro, zugferdXml);

        finalPdf = await pdfDocPro.save();
      }

      results.push({ pdfBuffer: finalPdf, orderId });
      console.log(`📄 Invoice ${orderId} generated with ${pageCount} page(s).`);
    }

    await user.save();
    await browser.close();

    // Send PDF(s)
    if (results.length === 1) {
      const { pdfBuffer, orderId } = results[0];
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${orderId}.pdf"`,
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
