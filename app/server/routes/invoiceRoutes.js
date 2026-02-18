const express = require("express");
const puppeteer = require("puppeteer");
const archiver = require("archiver");
const { PDFDocument } = require("pdf-lib");
const axios = require("axios");
const sharp = require("sharp");

const router = express.Router();
const User = require("../models/User");
const authenticate = require("../middleware/authenticate");
const dualAuth = require("../middleware/dualAuth");
const { incrementUsage } = require("../utils/usageUtils");
const { generateInvoiceHTML } = require("../../templates/english.js");
const { createPdfA3WithJava } = require("../Helpers/pdf-helpers");
const generateZugferdXml = require("../../xml/generateZugferdXml");

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
 * Fetch logo from URL and convert to base64 PNG
 * @param {string} logoUrl - URL of the logo image (supports PNG, JPG, SVG)
 * @returns {Promise<string>} Base64 encoded PNG logo or empty string
 */
async function fetchAndEncodeLogo(logoUrl) {
  if (!logoUrl || logoUrl.trim() === '') {
    return '';
  }

  try {
    log(`[Logo] Fetching logo from: ${logoUrl}`);
    const response = await axios.get(logoUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
      validateStatus: (status) => status === 200
    });

    // Check if the response is an image
    const contentType = response.headers['content-type'];
    if (!contentType || !contentType.startsWith('image/')) {
      log(`[Logo] Invalid content type: ${contentType}`);
      return '';
    }

    // Use sharp to convert to PNG (handles SVG conversion)
    const pngBuffer = await sharp(response.data)
      .png()
      .toBuffer();

    // Convert to base64
    const base64 = pngBuffer.toString('base64');
    log(`[Logo] Successfully fetched and encoded logo (${pngBuffer.length} bytes)`);
    return base64;
  } catch (err) {
    log(`[Logo] Failed to fetch logo: ${err.message}`);
    return '';
  }
}

/**
 * Map invoice data to Java service format
 */
async function mapInvoiceDataToJavaFormat(invoiceData) {
  log(`[DEBUG] mapInvoiceDataToJavaFormat received primaryColor: ${invoiceData.primaryColor}`);

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

  // Fetch and encode logo if provided
  const logoData = await fetchAndEncodeLogo(invoiceData.customLogoUrl || '');

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
    bankName: invoiceData.bankName || "",
    paymentTerms: invoiceData.paymentTerms || "Due within 14 days",
    creator: "PDFify",
    companyName: invoiceData.shopName || invoiceData.companyName || "Your Company",
    shopName: invoiceData.shopName || "Your Shop",
    shopAddress: invoiceData.shopAddress || "",
    primaryColor: invoiceData.primaryColor || "#00a6cc", // Pass custom color to Java service
    logoData, // Pass base64 encoded logo to Java service
    locale: {
      language: invoiceData.locale?.language || "en",
      format: locale
    },
  };
}

/**
 * Format date for PDF (D:YYYYMMDDHHmmSS+HH'mm')
 * @param {Date} date - JavaScript Date object
 * @returns {string} PDF-formatted date string
 */
function formatPdfDate(date) {
  const d = date || new Date();
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const seconds = String(d.getUTCSeconds()).padStart(2, '0');

  // For simplicity, use UTC (Z) timezone indicator
  return `D:${year}${month}${day}${hours}${minutes}${seconds}Z`;
}

/**
 * Attach ZUGFeRD XML to PDF as file attachment
 * @param {Buffer} pdfBuffer - Original PDF buffer
 * @param {object} invoiceData - Invoice data
 * @returns {Promise<Buffer>} PDF buffer with ZUGFeRD XML attached
 */
async function attachZugferdXml(pdfBuffer, invoiceData) {
  try {
    // Load the PDF
    const pdfDoc = await PDFDocument.load(pdfBuffer);

    // Generate ZUGFeRD XML
    const zugferdData = mapToZugferdFormat(invoiceData);
    const zugferdXml = generateZugferdXml(zugferdData);

    log(`[ZUGFeRD] Generated XML (${zugferdXml.length} bytes)`);

    // Create XML file attachment name
    const xmlFileName = `ZUGFeRD-Invoice-${invoiceData.orderId || 'invoice'}.xml`;
    const xmlBytes = Buffer.from(zugferdXml, 'utf-8');

    // Try to attach using pdf-lib
    // Note: pdf-lib has limited file attachment support
    // We'll use the catalog's embedded files name tree
    const pdfRef = pdfDoc.context.nextRef();
    const pdfDict = pdfDoc.context.obj({
      Type: 'Filespec',
      F: pdfDoc.context.obj(xmlFileName),
      EF: pdfDoc.context.obj({
        F: pdfDoc.context.stream(xmlBytes, {
          Type: 'EmbeddedFile',
          Subtype: 'text/xml',
          Filter: 'FlateDecode',
          Params: pdfDoc.context.obj({
            Size: xmlBytes.length,
            CreationDate: formatPdfDate(new Date()),
            ModDate: formatPdfDate(new Date()),
          }),
        }),
      }),
      Desc: pdfDoc.context.obj('ZUGFeRD Invoice XML'),
    });

    pdfDoc.context.assign(pdfRef, pdfDict);

    // Add to the catalog's Names dictionary
    let catalog = pdfDoc.catalog.object();
    if (!catalog.get(pdfDoc.context.obj('Names'))) {
      catalog.set(pdfDoc.context.obj('Names'), pdfDoc.context.obj({}));
    }
    const names = catalog.get(pdfDoc.context.obj('Names'));
    if (!names.get(pdfDoc.context.obj('EmbeddedFiles'))) {
      names.set(pdfDoc.context.obj('EmbeddedFiles'), pdfDoc.context.obj({}));
    }
    const embeddedFiles = names.get(pdfDoc.context.obj('EmbeddedFiles'));

    // Add the file to the EmbeddedFiles tree
    const filesRef = pdfDoc.context.nextRef();
    const filesDict = pdfDoc.context.obj({
      Names: pdfDoc.context.array([pdfDoc.context.obj(xmlFileName), pdfRef]),
      Limits: pdfDoc.context.array([pdfDoc.context.obj(xmlFileName), pdfDoc.context.obj(xmlFileName)]),
    });
    pdfDoc.context.assign(filesRef, filesDict);
    embeddedFiles.set(pdfDoc.context.obj('EmbeddedFiles'), filesRef);

    log(`[ZUGFeRD] XML attached as "${xmlFileName}"`);

    // Save and return
    const modifiedPdf = await pdfDoc.save();
    return Buffer.from(modifiedPdf);

  } catch (err) {
    log('[ZUGFeRD] Failed to attach XML, returning original PDF', { error: err.message });
    return pdfBuffer; // Return original PDF if attachment fails
  }
}

/**
 * Map invoice data to ZUGFeRD XML format
 * @param {object} invoiceData - Original invoice data
 * @returns {object} ZUGFeRD-compatible data
 */
function mapToZugferdFormat(invoiceData) {
  const currency = invoiceData.currency || 'EUR';

  // Parse tax rate
  const taxRate = parseFloat(invoiceData.taxRate?.replace('%', '') || '19');

  // Map items to ZUGFeRD format
  const items = (invoiceData.items || []).map(item => ({
    name: item.name || 'Item',
    quantity: parseFloat(item.quantity || 1),
    price: parseFloat(item.price || 0),
    net: parseFloat(item.net || (item.price * item.quantity)),
    tax: parseFloat(item.tax || 0),
    total: parseFloat(item.total || 0),
    taxRate: taxRate
  }));

  // Calculate totals from items if not provided
  const subtotal = parseFloat(invoiceData.subtotal) || items.reduce((sum, item) => sum + item.net, 0);
  const taxTotal = parseFloat(invoiceData.tax) || items.reduce((sum, item) => sum + item.tax, 0);
  const total = parseFloat(invoiceData.total) || (subtotal + taxTotal);

  // Default seller address (can be customized)
  const sellerAddress = invoiceData.sellerAddress || {
    postCode: '12345',
    street: 'Main Street 1',
    city: 'Anytown',
    country: invoiceData.country || 'DE'
  };

  // Default buyer address (can be customized)
  const buyerAddress = invoiceData.buyerAddress || {
    postCode: '12345',
    street: 'Customer Street 1',
    city: 'Customerton',
    country: invoiceData.country || 'DE'
  };

  return {
    orderId: invoiceData.orderId || `INV-${Date.now()}`,
    date: invoiceData.date || new Date().toISOString().split('T')[0],
    dueDate: invoiceData.dueDate || invoiceData.paymentTerms?.match(/(\d+)\s*days/)?.[1] ?
      (() => {
        const days = parseInt(invoiceData.paymentTerms.match(/(\d+)\s*days/)?.[1] || '14');
        const due = new Date(invoiceData.date);
        due.setDate(due.getDate() + days);
        return due.toISOString().split('T')[0];
      })() : null,
    currency,
    customerName: invoiceData.customerName || 'Customer',
    companyName: invoiceData.companyName || invoiceData.shopName || 'Your Company',
    iban: invoiceData.iban || 'DE89370400440532013000',
    items,
    subtotal,
    tax: taxTotal,
    total,
    sellerAddress,
    buyerAddress,
    sellerVatId: invoiceData.sellerVatId || 'DE123456789'
  };
}

// -----------------------------
// PDF generation helper
// -----------------------------
async function generatePdf(invoiceData, user, browser, reqInvoiceSource) {
  // Source + plan flags
  invoiceData.invoiceSource ||= reqInvoiceSource || "standard";
  invoiceData.isFreeUser = user.planType === "free";

  // Use Java service for ALL pro users (includes PDF/A-3b compliance + ZUGFeRD XML)
  if (user.planType === "pro") {
    log("Generating PDF via Java service (PDF/A-3b + ZUGFeRD for pro users)");

    try {
      const javaData = await mapInvoiceDataToJavaFormat(invoiceData);
      log(`[DEBUG] primaryColor passed to Java: ${javaData.primaryColor}`);
      const filename = `Invoice_${javaData.orderId}_${Date.now()}.pdf`;
      let pdfBuffer = await createPdfA3WithJava(javaData, filename);

      // Attach ZUGFeRD XML for pro users
      try {
        log("Attaching ZUGFeRD XML to PDF...");
        pdfBuffer = await attachZugferdXml(pdfBuffer, invoiceData);
        log("ZUGFeRD XML attached successfully");
      } catch (zugferdErr) {
        log("Warning: Failed to attach ZUGFeRD XML", { error: zugferdErr.message });
        // Continue without ZUGFeRD XML - PDF is still compliant
      }

      // Get page count
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      const pageCount = pdfDoc.getPageCount();

      return { pdfBuffer, pageCount };
    } catch (err) {
      log("Java service failed, falling back to Puppeteer", { error: err.message });
      // Fall through to Puppeteer fallback
    }
  }

  // Puppeteer fallback for free/premium users or if Java service fails
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
