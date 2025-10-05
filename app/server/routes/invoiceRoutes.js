// invoiceRoutes.mjs
import express from "express";
import puppeteer from "puppeteer";
import path from "path";
import fs from "fs";
import os from "os";
import archiver from "archiver";

import User from "../models/User.mjs";
import authenticate from "../middleware/authenticate.mjs";
import dualAuth from "../middleware/dualAuth.mjs";
import { incrementUsage } from "../utils/usageUtils.mjs";
import { generateInvoiceHTML } from "../../templates/english.js"; // free template
import { generateInvoiceHTMLPro } from "../../templates/english-pro-compliant.js"; // pro compliant
import { generateZugferdXML, embedXmp, embedIccProfile, embedXmlIntoPdf, makePdfA3b } from "../Helpers/pdf-helpers.mjs";

import slLocale from '../../locales/sl.json' assert { type: "json" };
import enLocale from '../../locales/en.json' assert { type: "json" };
import deLocale from '../../locales/de.json' assert { type: "json" };

const locales = { sl: slLocale, en: enLocale, de: deLocale };
const FORCE_PLAN = process.env.FORCE_PLAN;
const DEBUG_MODE = process.env.DEBUG_MODE === "true";

const log = (message, meta = {}) => {
  console.log("[InvoiceRoute]", message, meta);
};

// -----------------------------
// PDF generation helper
// -----------------------------
async function generatePdf(invoiceData, user, browser) {
  const PDFLib = (await import("pdf-lib")).PDFDocument;
  log("Starting PDF generation", { invoiceData, planType: user.planType });

  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 1600 });
  await page.emulateMediaType('print');

  const useCompliant = user.planType === "pro" && invoiceData.compliant === true;
  invoiceData.userClass = useCompliant ? "pdfa-clean" : "";

  log("Using template", { useCompliant });

  if (user.planType === "free" && !invoiceData.customLogoUrl) {
    invoiceData.customLogoUrl = path.resolve("./public/images/Logo.png");
    log("Set default logo for free user", { logo: invoiceData.customLogoUrl });
  }

  const html = useCompliant
    ? await generateInvoiceHTMLPro(invoiceData)
    : await generateInvoiceHTML(invoiceData);

  log("HTML generated for PDF", { length: html.length });

  await page.setContent(html, { waitUntil: "load", timeout: 30000 });
  await page.evaluateHandle('document.fonts.ready');

  let pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "20mm", bottom: "20mm", left: "10mm", right: "10mm" },
    displayHeaderFooter: false,
    preferCSSPageSize: true
  });

  await page.close();

  const pdfDoc = await PDFLib.load(pdfBuffer);
  const pageCount = pdfDoc.getPageCount();
  log("PDF page count", { pageCount });

  const usageAllowed = await incrementUsage(user, pageCount, invoiceData.isPreview, FORCE_PLAN);
  if (!usageAllowed) {
    log("Usage limit reached", { userId: user._id });
    throw new Error('Monthly limit reached.');
  }

  if (useCompliant) {
    try {
      invoiceData.invoiceSource ||= "standard";
      const isStandardInvoice = invoiceData.invoiceSource === "standard";

      log("Compliant check", { useCompliant, invoiceSource: invoiceData.invoiceSource, isStandardInvoice });

      if (isStandardInvoice) {
        const pdfDocPro = await PDFLib.load(pdfBuffer);

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
        log("Skipping ZUGFeRD and PDF/A for non-standard invoice", { invoiceSource: invoiceData.invoiceSource });
      }
    } catch (err) {
      log("Error in compliant PDF processing", { error: err.message, stack: err.stack });
      throw err;
    }
  }

  log("PDF generation complete", { pageCount, useCompliant, invoiceSource: invoiceData.invoiceSource });
  return { pdfBuffer, pageCount };
}

// -----------------------------
// /generate-invoice route
// -----------------------------
const router = express.Router();

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

export default router;
