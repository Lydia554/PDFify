const fs = require("fs");
const { PDFDocument, PDFName, PDFString } = require("pdf-lib");

/**
 * Embed ICC profile into an existing PDF buffer (VeraPDF-compliant)
 * @param {Buffer} pdfBuffer
 * @param {string} iccPath
 * @returns {Promise<Buffer>}
 */
async function embedIccProfile(pdfBuffer, iccPath) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);

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

  // return saved buffer, not PDFDocument
  return await pdfDoc.save({ useObjectStreams: false });
}

module.exports = { embedIccProfile };
