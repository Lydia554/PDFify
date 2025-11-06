const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");
const { spawnSync } = require("child_process");

const debugDir = path.join(__dirname, "debug_steps_pdfa_test");
fs.mkdirSync(debugDir, { recursive: true });

(async () => {
  // --- 1️⃣ Create base PDF ---
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  page.drawText("PDF/A Debug Test - Step 1: Base PDF", { x: 50, y: 800 });

  let pdfBuffer = await pdfDoc.save({ useObjectStreams: false });
  const step1Path = path.join(debugDir, "step1_base.pdf");
  fs.writeFileSync(step1Path, pdfBuffer);
  console.log("📄 Step 1: Base PDF created →", step1Path);

  // --- 2️⃣ Remove metadata ---
  const pdfDoc2 = await PDFDocument.load(pdfBuffer);
  if (pdfDoc2.catalog.get("Metadata")) pdfDoc2.catalog.delete("Metadata");
  pdfBuffer = await pdfDoc2.save({ useObjectStreams: false });
  const step2Path = path.join(debugDir, "step2_metadata_cleaned.pdf");
  fs.writeFileSync(step2Path, pdfBuffer);
  console.log("📄 Step 2: Metadata cleaned →", step2Path);

  // --- 3️⃣ Convert to PDF/A-3b via Ghostscript ---
  const tmpInput = path.join(debugDir, "gs_input.pdf");
  const tmpOutput = path.join(debugDir, "step3_pdfa3b.pdf");
  fs.writeFileSync(tmpInput, pdfBuffer);

  const gsExe =
    process.platform === "win32"
      ? "C:\\Program Files\\gs\\gs10.05.1\\bin\\gswin64c.exe"
      : "gs";
  const iccProfilePath =
    process.platform === "win32"
      ? "C:\\Windows\\System32\\spool\\drivers\\color\\sRGB Color Space Profile.icm"
      : "/usr/share/color/icc/ghostscript/srgb.icc";

  console.log("🔹 Running Ghostscript for PDF/A-3b...");
  const gs = spawnSync(
    gsExe,
    [
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
      `-sOutputICCProfile=${iccProfilePath}`,
      `-sOutputFile=${tmpOutput}`,
      tmpInput,
    ],
    { encoding: "utf-8" }
  );

  if (gs.error || gs.status !== 0) {
    console.error("❌ Ghostscript failed:", gs.stderr || gs.error);
    process.exit(1);
  }

  console.log("📄 Step 3: PDF/A-3b saved →", tmpOutput);
  console.log("🎯 All steps complete. Check PDFs in 'debug_steps_pdfa_test' folder.");
})();
