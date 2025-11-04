const fs = require("fs");
const path = require("path");
const { PDFDocument, PDFName } = require("pdf-lib");
const { spawnSync } = require("child_process");
const { createBasePdf } = require("./server/routes/shopify/shopifyMerchantTemplate");
const { finalizePdf } = require("./server/Helpers/pdf-helpers");

(async () => {
  try {
    const tmpDir = path.join(__dirname, "debug_steps");
    fs.mkdirSync(tmpDir, { recursive: true });

    const invoiceData = {
      orderId: "DEBUG-TEST",
      date: new Date().toISOString().slice(0, 10),
      items: [{ name: "Test Item", quantity: 1, price: 10, net: 10, tax: 2, total: 12, taxRate: 21 }],
      subtotal: 10,
      tax: 2,
      total: 12,
      vatRate: 21,
      customerName: "Test Customer",
      iban: "DE89370400440532013000",
      bic: "COBADEFFXXX",
      paymentTerms: "Due within 14 days",
      creator: "PDFify",
      locale: { language: "en" },
    };

    // Step 1️⃣ Base PDF
    let pdfBuffer = await createBasePdf(invoiceData);
    const step1Path = path.join(tmpDir, "step1_base.pdf");
    fs.writeFileSync(step1Path, pdfBuffer);
    console.log("✅ Step 1: Base PDF saved");

    // Step 2️⃣ Strip metadata
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    if (pdfDoc.context.trailerInfo.Info) pdfDoc.context.delete(pdfDoc.context.trailerInfo.Info);
    const metadataStream = pdfDoc.catalog.get(PDFName.of("Metadata"));
    if (metadataStream) pdfDoc.catalog.delete(PDFName.of("Metadata"));
    pdfBuffer = Buffer.from(await pdfDoc.save());
    const step2Path = path.join(tmpDir, "step2_metadata_stripped.pdf");
    fs.writeFileSync(step2Path, pdfBuffer);
    console.log("✅ Step 2: Metadata stripped");

    // Ghostscript executable on Windows
    const gsExe = "C:\\Program Files\\gs\\gs10.05.1\\bin\\gswin64c.exe";

    // Step 3️⃣ Flatten via Ghostscript
    const tmpFlattened = path.join(tmpDir, "step3_flattened.pdf");
    const gsFlatten = spawnSync(gsExe, [
      "-sDEVICE=pdfwrite",
      "-dNOPAUSE",
      "-dBATCH",
      "-dNOSAFER",
      "-dEmbedAllFonts=true",
      "-dSubsetFonts=true",
      "-dCompressFonts=true",
      "-dDetectDuplicateImages=true",
      "-dColorImageDownsampleType=/Bicubic",
      "-dColorImageResolution=300",
      `-sOutputFile=${tmpFlattened}`,
      step2Path
    ], { encoding: "utf-8" });

    console.log("🔹 Step 3 Ghostscript flatten stdout:", gsFlatten.stdout);
    console.log("🔹 Step 3 Ghostscript flatten stderr:", gsFlatten.stderr);
    console.log("🔹 Step 3 Ghostscript status:", gsFlatten.status);
    if (gsFlatten.error || gsFlatten.status !== 0) {
      console.error("❌ Step 3: Ghostscript flatten failed");
    } else {
      pdfBuffer = fs.readFileSync(tmpFlattened);
      console.log("✅ Step 3: Flattened PDF saved");
    }

    // Step 4️⃣ Convert to PDF/A-3b
    const tmpPdfa = path.join(tmpDir, "step4_pdfa3b.pdf");
    const iccProfile = path.resolve("./server/Helpers/sRGB_v4_ICC_preference.icc");

    const gsPdfa = spawnSync(gsExe, [
      "-dPDFA=3",
      "-dPDFACompatibilityPolicy=1",
      "-sDEVICE=pdfwrite",
      "-dNOPAUSE",
      "-dBATCH",
      "-dNOSAFER",
      "-dEmbedAllFonts=true",
      "-dSubsetFonts=true",
      "-dCompressFonts=true",
      "-dProcessColorModel=/DeviceRGB",
      `-sOutputICCProfile=${iccProfile}`,
      `-sOutputFile=${tmpPdfa}`,
      tmpFlattened
    ], { encoding: "utf-8" });

    console.log("🔹 Step 4 Ghostscript PDF/A-3b stdout:", gsPdfa.stdout);
    console.log("🔹 Step 4 Ghostscript PDF/A-3b stderr:", gsPdfa.stderr);
    console.log("🔹 Step 4 Ghostscript status:", gsPdfa.status);

    if (gsPdfa.error || gsPdfa.status !== 0) {
      console.error("❌ Step 4: PDF/A-3b conversion failed");
    } else {
      pdfBuffer = fs.readFileSync(tmpPdfa);
      console.log("✅ Step 4: PDF/A-3b saved");
    }

    // Step 5️⃣ Embed ZUGFeRD
    const finalPdf = await finalizePdf(pdfBuffer, invoiceData);
    const step5Path = path.join(tmpDir, "step5_final_zugferd.pdf");
    fs.writeFileSync(step5Path, finalPdf);
    console.log("✅ Step 5: ZUGFeRD embedded PDF saved");

    console.log("🎉 All steps completed, check 'debug_steps' folder");

  } catch (err) {
    console.error("❌ Debug script failed:", err);
  }
})();
