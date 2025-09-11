#!/usr/bin/env node
/**
 * Test script for PDF/A-3b generation + strict post-processing
 */

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const { postProcessPdfStrict } = require("../server/utils/postProcessPdfStrict");

(async () => {
  try {
    const inputPdfPath = path.resolve(__dirname, "Gen.pdf");
    if (!fs.existsSync(inputPdfPath)) throw new Error("Input PDF missing.");

    console.log("📄 Loaded input PDF:", inputPdfPath);

    // --- Ghostscript executable ---
    const gsExe = "C:\\Program Files\\gs\\gs10.05.1\\bin\\gswin64c.exe";
    if (!fs.existsSync(gsExe)) throw new Error("Ghostscript not found at " + gsExe);
    console.log("🎯 Using Ghostscript executable:", gsExe);

    // --- ICC profile ---
    const iccPath = path.resolve(__dirname, "../server/routes/sRGB_v4_ICC_preference.icc");
    if (!fs.existsSync(iccPath)) throw new Error("ICC profile missing at " + iccPath);
    console.log("🎨 Using ICC profile:", iccPath);

    // --- Puppeteer PDF generation ---
    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage();
    await page.goto("file://" + inputPdfPath, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", bottom: "20mm", left: "10mm", right: "10mm" },
      preferCSSPageSize: false,
      displayHeaderFooter: false,
      // Tagged PDF/A emulation
      headerTemplate: "",
      footerTemplate: "",
    });

    await browser.close();
    console.log("✅ Puppeteer PDF generated");

    // --- Save intermediate PDF ---
    const tempOutput = path.resolve(__dirname, "Gen_postprocessed.pdf");
    const postprocessedPdf = await postProcessPdfStrict(pdfBuffer, null, { title: "Invoice", creator: "PDFify", language: "en" });
    fs.writeFileSync(tempOutput, postprocessedPdf);

    console.log("✅ PDF post-processed and saved to:", tempOutput);

    console.log("🎯 Test complete: PDF/A-3b generation + strict post-processing");
  } catch (err) {
    console.error("❌ Error in test:", err);
  }
})();
