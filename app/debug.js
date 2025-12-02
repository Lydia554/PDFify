const fs = require("fs");
const path = require("path");
const { PDFDocument, PDFName, PDFHexString } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { finalizePdf } = require("./server/Helpers/pdf-helpers"); // adjust path if needed

const debugDir = path.join(__dirname, "debug_steps_pdfa_test");
fs.mkdirSync(debugDir, { recursive: true });

(async () => {
  // ---------------------
  // Step 1: Base PDF
  // ---------------------
  console.log("🟢 Step 1: Create base PDF with embedded fonts");
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const page = pdfDoc.addPage([595, 842]);
  page.drawText("PDF/A Debug Test - Base PDF", { x: 50, y: 800 });

  const regularFontBytes = fs.readFileSync(path.resolve(__dirname, "./templates/fonts/LiberationSans-Regular.ttf"));
  const boldFontBytes = fs.readFileSync(path.resolve(__dirname, "./templates/fonts/LiberationSans-Bold.ttf"));
  const regularFont = await pdfDoc.embedFont(regularFontBytes);
  const boldFont = await pdfDoc.embedFont(boldFontBytes);

  page.drawText("Test header using embedded fonts", { x: 50, y: 780, font: boldFont, size: 14 });

  let pdfBuffer = await pdfDoc.save({ useObjectStreams: false });
  const step1Path = path.join(debugDir, "step1_base.pdf");
  fs.writeFileSync(step1Path, pdfBuffer);
  console.log("📄 Step 1 saved →", step1Path);

  // ---------------------
  // Step 2: Add XMP metadata
  // ---------------------
  console.log("🟢 Step 2: Add XMP metadata");
  const pdfDoc2 = await PDFDocument.load(pdfBuffer);

  const now = new Date().toISOString();
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
  console.log("📄 Step 2 saved →", step2Path);

  // ---------------------
  // Step 3: Convert to PDF/A-3b using Ghostscript
  // ---------------------
  console.log("🟢 Step 3: Convert to PDF/A-3b using Ghostscript");
  const tmpInput = path.join(debugDir, "gs_input.pdf");
  const tmpOutput = path.join(debugDir, "step3_pdfa3b.pdf");
  fs.writeFileSync(tmpInput, pdfBuffer);

  const gsExe = process.platform === "win32"
    ? "C:\\Program Files\\gs\\gs10.05.1\\bin\\gswin64c.exe"
    : "gs";

  const iccProfilePath = path.resolve("./server/Helpers/sRGB_v4_ICC_preference.icc");

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
    tmpInput,
  ], { encoding: "utf-8" });

  if (gs.error || gs.status !== 0) {
    console.error("❌ Ghostscript failed:", gs.stderr || gs.error);
    process.exit(1);
  }

  pdfBuffer = fs.readFileSync(tmpOutput);
  console.log("📄 Step 3 saved →", tmpOutput);

  // ---------------------
  // Step 4: Embed ZUGFeRD XML (mock)
  // ---------------------
  console.log("🟢 Step 4: Embed ZUGFeRD XML (mock)");

  const mockOrder = {
    orderId: "TEST123",
    line_items: [{ title: "Test Item", quantity: 1, price: 10, tax_lines: [{ price: 2 }] }],
    currency: "EUR",
    created_at: new Date().toISOString(),
    customer: { first_name: "John", last_name: "Doe" },
    payment: { terms: "Due within 14 days" },
  };

  try {
    const step4Buffer = await finalizePdf(pdfBuffer, mockOrder);
    const step4Path = path.join(debugDir, "step4_zugferd_embedded.pdf");
    fs.writeFileSync(step4Path, step4Buffer);
    console.log("📄 Step 4 saved →", step4Path);
  } catch (err) {
    console.error("⚠️ Step 4 skipped due to ZUGFeRD embedding error:", err.message);
  }

  console.log("🎯 Debug PDF steps complete. Validate each step with VeraPDF.");
})();
