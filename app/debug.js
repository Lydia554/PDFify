const fs = require("fs");
const path = require("path");
const { PDFDocument, PDFName } = require("pdf-lib");
const { spawnSync } = require("child_process");

const debugDir = path.join(__dirname, "debug_steps_pdfa_test");
fs.mkdirSync(debugDir, { recursive: true });

(async () => {
  // --- 1️⃣ Create base PDF ---
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  page.drawText("PDF/A Debug Test - Base PDF", { x: 50, y: 800 });
  let pdfBuffer = await pdfDoc.save({ useObjectStreams: false });

  const step1Path = path.join(debugDir, "step1_base.pdf");
  fs.writeFileSync(step1Path, pdfBuffer);
  console.log("📄 Step 1: Base PDF created →", step1Path);

  // --- 2️⃣ Inject valid XMP metadata ---
  const pdfDoc2 = await PDFDocument.load(pdfBuffer);

  const xmp = `<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?>
<x:xmpmeta xmlns:x='adobe:ns:meta/' x:xmptk='pdf-lib'>
  <rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>
    <rdf:Description rdf:about=''
        xmlns:pdfaid='http://www.aiim.org/pdfa/ns/id/'>
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end='w'?>`;

  const metadataStream = pdfDoc2.context.stream(Buffer.from(xmp, "utf8"), {
    Type: PDFName.of("Metadata"),
    Subtype: PDFName.of("XML"),
  });

  const metadataRef = pdfDoc2.context.register(metadataStream);
  pdfDoc2.catalog.set(PDFName.of("Metadata"), metadataRef);
  pdfDoc2.catalog.set(PDFName.of("MarkInfo"), pdfDoc2.context.obj({ Marked: true }));

  pdfBuffer = await pdfDoc2.save({ useObjectStreams: false });
  const step2Path = path.join(debugDir, "step2_xmp_added.pdf");
  fs.writeFileSync(step2Path, pdfBuffer);
  console.log("📄 Step 2: Added valid XMP metadata →", step2Path);

  // --- 3️⃣ Convert to PDF/A-3b with Ghostscript ---
  const tmpInput = path.join(debugDir, "gs_input.pdf");
  const tmpOutput = path.join(debugDir, "step3_pdfa3b.pdf");
  fs.writeFileSync(tmpInput, pdfBuffer);

  const gsExe = process.platform === "win32"
    ? "C:\\Program Files\\gs\\gs10.05.1\\bin\\gswin64c.exe"
    : "gs";

  const iccProfilePath = path.resolve("./server/Helpers/sRGB_v4_ICC_preference.icc");
  console.log("🔹 Running Ghostscript for PDF/A-3b...");

  const gs = spawnSync(gsExe, [
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
    "-sColorConversionStrategy=RGB",
    `-sOutputICCProfile=${iccProfilePath}`,
    `-sOutputFile=${tmpOutput}`,
    tmpInput, // only PDF input
  ], { encoding: "utf-8" });

  if (gs.error || gs.status !== 0) {
    console.error("❌ Ghostscript failed:", gs.stderr || gs.error);
    process.exit(1);
  }

  console.log("📄 Step 3: PDF/A-3b saved →", tmpOutput);
  console.log("🎯 All steps complete. Validate with VeraPDF now.");
})();
