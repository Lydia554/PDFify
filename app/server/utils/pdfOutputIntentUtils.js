const { PDFDocument, PDFName, PDFString } = require('pdf-lib');
const fs = require('fs');

async function ensureOutputIntents(pdfBytes, iccPath) {
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // Check if OutputIntents already exists
  const catalog = pdfDoc.catalog;
  if (catalog.get(PDFName.of('OutputIntents'))) {
    console.log("📄 OutputIntents already present");
    return pdfBytes;
  }

  console.log("⚠️ No OutputIntents found. Injecting...");

  // Read ICC profile
  const iccData = fs.readFileSync(iccPath);
  const iccStream = pdfDoc.context.register(pdfDoc.context.stream(iccData));

  // Create OutputIntent dictionary
  const oiDict = pdfDoc.context.obj({
    Type: PDFName.of('OutputIntent'),
    S: PDFName.of('GTS_PDFA1'),
    OutputConditionIdentifier: PDFString.of('sRGB v4 ICC preference'),
    Info: PDFString.of('sRGB v4 ICC preference'),
    DestOutputProfile: iccStream
  });

  const oiArray = pdfDoc.context.obj([oiDict]);
  catalog.set(PDFName.of('OutputIntents'), oiArray);

  console.log("✅ OutputIntents injected");
  return await pdfDoc.save({ useObjectStreams: false });
}

module.exports = { ensureOutputIntents };
