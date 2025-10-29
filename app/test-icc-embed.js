// -----------------------------
// test-icc-embed.js
// -----------------------------
const fs = require("fs");
const path = require("path");
const { PDFDocument, PDFName, PDFString } = require("pdf-lib");

async function embedICCManual() {
  const input = "./phase2_metadata.pdf"; 
  const iccProfilePath = path.resolve("C:/Users/goldb/Pro/PDF-API/app/server/Helpers/sRGB_v4_ICC_preference.icc");
  const output = "./phase3a_manual_icc.pdf";

  console.log("🧩 Loading:", input);
  const pdfBytes = fs.readFileSync(input);
  const pdfDoc = await PDFDocument.load(pdfBytes);

  console.log("🎨 Embedding ICC profile from:", iccProfilePath);
  const iccBytes = fs.readFileSync(iccProfilePath);

  // Create OutputIntent stream
  const iccStream = pdfDoc.context.flateStream(iccBytes, {
    N: 3, // RGB profile (3 channels)
  });

  const iccRef = pdfDoc.context.register(iccStream);

  const outputIntentDict = pdfDoc.context.obj({
    Type: PDFName.of("OutputIntent"),
    S: PDFName.of("GTS_PDFA1"),
    OutputConditionIdentifier: PDFString.of("sRGB IEC61966-2.1"),
    DestOutputProfile: iccRef,
  });

  const outputIntentRef = pdfDoc.context.register(outputIntentDict);
  const catalog = pdfDoc.catalog;

  catalog.set(
    PDFName.of("OutputIntents"),
    pdfDoc.context.obj([outputIntentRef])
  );

  const finalPdf = await pdfDoc.save();
  fs.writeFileSync(output, finalPdf);

  console.log("✅ Saved:", output);
  console.log("→ Now open this in VeraPDF to test if it loads correctly");
}

embedICCManual().catch(console.error);
