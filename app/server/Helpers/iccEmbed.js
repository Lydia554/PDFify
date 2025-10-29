// -----------------------------
// iccEmbed.js
// -----------------------------
const fs = require("fs");
const { PDFDocument, PDFName, PDFString } = require("pdf-lib");

/**
 * Embed ICC profile into an existing PDFDocument (in-place)
 * @param {PDFDocument} pdfDoc
 * @param {string} iccPath
 */
async function embedIccProfile(pdfDoc, iccPath) {
  if (!fs.existsSync(iccPath)) {
    throw new Error(`ICC profile not found at ${iccPath}`);
  }

  const iccBytes = fs.readFileSync(iccPath);

  // Create OutputIntent dictionary correctly
  const outputIntentDict = pdfDoc.context.obj({
    Type: PDFName.of("OutputIntent"),
    S: PDFName.of("GTS_PDFA1"),
    OutputConditionIdentifier: PDFString.of("sRGB IEC61966-2.1"),
    Info: PDFString.of("sRGB IEC61966-2.1"),
    DestOutputProfile: pdfDoc.context.stream(iccBytes, { Filter: PDFName.of("FlateDecode") }),
    RegistryName: PDFString.of("http://www.color.org"),
  });

  const outputIntentRef = pdfDoc.context.register(outputIntentDict);
  pdfDoc.catalog.set(PDFName.of("OutputIntents"), pdfDoc.context.obj([outputIntentRef]));
}

module.exports = { embedIccProfile };
