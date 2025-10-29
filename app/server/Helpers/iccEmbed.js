const fs = require("fs");
const { PDFName, PDFString } = require("pdf-lib");

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
  const iccStream = pdfDoc.context.stream(iccBytes);
  const iccRef = pdfDoc.context.register(iccStream);

  const outputIntent = pdfDoc.context.obj({
    Type: PDFName.of("OutputIntent"),
    S: PDFName.of("GTS_PDFA1"),
    OutputConditionIdentifier: PDFString.of("sRGB IEC61966-2.1"),
    Info: PDFString.of("sRGB IEC61966-2.1"),
    DestOutputProfile: iccRef,
    RegistryName: PDFString.of("http://www.color.org"),
  });

  const outputIntentRef = pdfDoc.context.register(outputIntent);
  const arrRef = pdfDoc.context.register(pdfDoc.context.obj([outputIntentRef]));
  pdfDoc.catalog.set(PDFName.of("OutputIntents"), arrRef);
}

module.exports = { embedIccProfile };
