const express = require("express");
const puppeteer = require("puppeteer");
const archiver = require("archiver");

const router = express.Router();
const User = require("../models/User");
const authenticate = require("../middleware/authenticate");
const dualAuth = require("../middleware/dualAuth");
const { incrementUsage } = require("../utils/usageUtils");
const { generateInvoiceHTML } = require("../../templates/english.js");
const { createPdfA3WithJava } = require("../Helpers/pdf-helpers");

const locales = {
  sl: require("../../locales/sl.json"),
  en: require("../../locales/en.json"),
  de: require("../../locales/de.json"),
};

const FORCE_PLAN = process.env.FORCE_PLAN;
const DEBUG_MODE = process.env.DEBUG_MODE === "true";

const log = (message, meta = {}) => console.log("[InvoiceRoute]", message, meta);

// ----------------------------
// Helper Functions
// ----------------------------

/**
 * Format number as currency string
 */
function formatPrice(amount, currency = "EUR", locale = "en-US") {
  if (typeof amount !== 'number') {
    amount = parseFloat(amount);
  }
  if (isNaN(amount)) {
    return "";
  }
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
}

/**
 * Map invoice data to Java service format
 */
function mapInvoiceDataToJavaFormat(invoiceData) {
  const currency = invoiceData.currency || "EUR";
  const locale = invoiceData.locale?.format || "en-US";

  // Map items
  const items = (invoiceData.items || []).map((item, index) => {
    const price = parseFloat(item.price || 0);
    const quantity = parseFloat(item.quantity || 1);
    const net = parseFloat(item.net || price * quantity);
    const tax = parseFloat(item.tax || 0);
    const total = parseFloat(item.total || net + tax);

    return {
      position: index + 1,
      name: item.name || "Item",
      quantity,
      unitCode: "EA",
      price,
      formattedPrice: formatPrice(price, currency, locale),
      net,
      formattedNet: formatPrice(net, currency, locale),
      tax,
      formattedTax: formatPrice(tax, currency, locale),
      total,
      formattedTotal: formatPrice(total, currency, locale),
      taxRate: parseFloat(invoiceData.taxRate?.replace('%', '') || 21),
      currency,
    };
  });

  const subtotal = parseFloat(invoiceData.subtotal || items.reduce((sum, i) => sum + i.net, 0));
  const taxTotal = parseFloat(invoiceData.tax || items.reduce((sum, i) => sum + i.tax, 0));
  const total = parseFloat(invoiceData.total || subtotal + taxTotal);

  return {
    orderId: invoiceData.orderId || `INV-${Date.now()}`,
    date: invoiceData.date || new Date().toISOString().split('T')[0],
    customerName: invoiceData.customerName || "Customer",
    customerEmail: invoiceData.customerEmail || "",
    customerAddress: invoiceData.customerAddress || "",
    items,
    subtotal,
    formattedSubtotal: formatPrice(subtotal, currency, locale),
    tax: taxTotal,
    formattedTaxTotal: formatPrice(taxTotal, currency, locale),
    total,
    formattedTotal: formatPrice(total, currency, locale),
    vatRate: parseFloat(invoiceData.taxRate?.replace('%', '') || 21),
    currency,
    iban: invoiceData.iban || "",
    bic: invoiceData.bic || "",
    paymentTerms: invoiceData.paymentTerms || "Due within 14 days",
    creator: "PDFify",
    companyName: invoiceData.shopName || invoiceData.companyName || "Your Company",
    shopName: invoiceData.shopName || "Your Shop",
    shopAddress: invoiceData.shopAddress || "",
    locale: {
      language: invoiceData.locale?.language || "en",
      format: locale
    },
  };
}

// -----------------------------
// PDF generation helper
// -----------------------------
async function generatePdf(invoiceData, user, browser, reqInvoiceSource) {
  // Source + plan flags
  invoiceData.invoiceSource ||= reqInvoiceSource || "standard";
  invoiceData.isFreeUser = user.planType === "free";

  // Use Java service for PDF/A-3b compliant PDFs
  if (user.planType === "pro" && invoiceData.compliant) {
    log("Generating PDF/A-3b compliant PDF via Java service");

    try {
      const javaData = mapInvoiceDataToJavaFormat(invoiceData);
      const filename = `Invoice_${javaData.orderId}_${Date.now()}.pdf`;
      const pdfBuffer = await createPdfA3WithJava(javaData, filename);

      // Get page count
      const { PDFDocument } = require("pdf-lib");
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      const pageCount = pdfDoc.getPageCount();

      return { pdfBuffer, pageCount };
    } catch (err) {
      log("Java service failed, falling back to Puppeteer", { error: err.message });
      // Fall through to Puppeteer fallback
    }
  }

  // Puppeteer fallback for colorful PDFs or if Java service fails
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 1600 });
  await page.emulateMediaType("print");

  // Generate HTML template
  let html;
  try {
    html = await generateInvoiceHTML(invoiceData);
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

  // Get page count
  const { PDFDocument } = require("pdf-lib");
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pageCount = pdfDoc.getPageCount();

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
