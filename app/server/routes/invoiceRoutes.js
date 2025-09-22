const express = require("express");
const path = require("path");
const fs = require("fs");
const os = require("os");
const archiver = require("archiver");
const router = express.Router();

const User = require("../models/User");
const authenticate = require("../middleware/authenticate");
const dualAuth = require("../middleware/dualAuth");
const { incrementUsage } = require("../utils/usageUtils");
const { embedIccProfile, embedXmlIntoPdf, generateZugferdXML } = require("../Helpers/pdf-helpers");


const locales = {
  sl: require('../../locales/sl.json'),
  en: require('../../locales/en.json'),
  de: require('../../locales/de.json'),
};

const FORCE_PLAN = process.env.FORCE_PLAN;

router.post("/generate-invoice", authenticate, dualAuth, async (req, res) => {
  const tmpDir = path.join(os.tmpdir(), `pdfify-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    let requests = req.body.requests;
    if (!Array.isArray(requests)) requests = [{ data: req.body.data, isPreview: req.body.isPreview }];
    if (!requests.length) return res.status(400).json({ error: "No requests provided." });

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const results = [];

    for (const { data: invoiceDataRaw, isPreview } of requests) {
      const invoiceData = { ...invoiceDataRaw };
      const orderId = invoiceData.orderId || `order-${Date.now()}`;
      const country = (invoiceData.country || "").toLowerCase();
      const lang = invoiceData.invoiceLanguage || (country === "germany" ? "de" : country === "slovenia" ? "sl" : "en");
      invoiceData.country = country || "default";
      invoiceData.locale = locales[lang] || locales["en"];

      // Germany-specific VAT logic
      if (country === "germany" && Array.isArray(invoiceData.items)) {
        invoiceData.items = invoiceData.items.map(item => {
          const totalNum = parseFloat(item.total || 0);
          const net = totalNum / 1.19;
          const tax = totalNum - net;
          return { ...item, net: net.toFixed(2), tax: tax.toFixed(2) };
        });
      }

      // Tax rate string
      invoiceData.taxRate = typeof invoiceData.taxRate === "number"
        ? `${(invoiceData.taxRate * 100).toFixed(0)}%`
        : invoiceData.taxRate || '21%';

      // Generate PDF using the new helper
      let pdfBuffer = await createShopifyInvoicePdf(invoiceData);

      // Pro users: embed ICC profile + ZUGFeRD XML directly
      if (user.plan === "pro") {
        embedIccProfile(pdfBuffer);
        const zugferdXml = generateZugferdXML(invoiceData);
        embedXmlIntoPdf(pdfBuffer, zugferdXml);
      }

      // Count pages for usage
      const pdfDoc = await require("pdf-lib").PDFDocument.load(pdfBuffer);
      const pageCount = pdfDoc.getPageCount();
      const usageAllowed = await incrementUsage(user, pageCount, false, FORCE_PLAN);
      if (!usageAllowed) {
        return res.status(403).json({ error: 'Monthly limit reached.' });
      }

      results.push({ pdfBuffer, orderId });
      console.log(`📄 Invoice ${orderId} generated (${pageCount} page(s))`);
    }

    await user.save();

    if (results.length === 1) {
      const { pdfBuffer, orderId } = results[0];
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${orderId}.pdf"`,
        "Content-Length": pdfBuffer.length
      });
      return res.send(pdfBuffer);
    }

    // Multiple invoices → ZIP
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
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

module.exports = router;
