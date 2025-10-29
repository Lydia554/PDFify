const fs = require("fs");
const { PDFDocument, PDFName } = require("pdf-lib");

/**
 * Embed ICC profile into an existing PDF buffer (VeraPDF-compliant)
 * @param {Buffer} pdfBuffer - input PDF
 * @param {string} iccPath - path to ICC profile
 * @returns {Promise<Buffer>} - output PDF buffer
 */
async function embedIccProfile(pdfBuffer, iccPath) {
  if (!fs.existsSync(iccPath)) {
    throw new Error(`ICC profile not found at ${iccPath}`);
  }

  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const iccBytes = fs.readFileSync(iccPath);

  // Create ICC OutputIntent stream
 const iccStream = pdfDoc.context.stream(iccBytes); 

  const iccRef = pdfDoc.context.register(iccStream);

  const outputIntent = pdfDoc.context.obj({
    Type: PDFName.of("OutputIntent"),
    S: PDFName.of("GTS_PDFA1"),
    OutputConditionIdentifier: "sRGB IEC61966-2.1",
    Info: "sRGB IEC61966-2.1",
    DestOutputProfile: iccRef,
    RegistryName: "http://www.color.org",
  });

  const outputIntentRef = pdfDoc.context.register(outputIntent);
  pdfDoc.catalog.set(PDFName.of("OutputIntents"), pdfDoc.context.obj([outputIntentRef]));

  return await pdfDoc.save();
}

module.exports = { embedIccProfile };
