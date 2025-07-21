// xmp/embedXmp.js
const fs = require("fs");

const { PDFName } = require("pdf-lib");

/**
 * Embed sanitized XMP metadata from a file into a PDFDocument's catalog.
 * @param {PDFDocument} pdfDoc - The pdf-lib PDFDocument instance.
 * @param {string} xmpFilePath - Path to the XMP XML file.
 */
async function embedXmp(pdfDoc, xmpFilePath) {
  const catalog = pdfDoc.catalog;

  try {
    const rawXmp = fs.readFileSync(xmpFilePath, "utf-8");
    // Sanitize non-printable chars, allow tabs/newlines, trim spaces
    const sanitizedXmp = rawXmp.replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD]/g, "").trim();

    const metadataStream = pdfDoc.context.flateStream(Buffer.from(sanitizedXmp, "utf-8"), {
      Type: PDFName.of("Metadata"),
      Subtype: PDFName.of("XML"),
      Filter: PDFName.of("FlateDecode"),
    });

    const metadataRef = pdfDoc.context.register(metadataStream);
    catalog.set(PDFName.of("Metadata"), metadataRef);

    console.log("✅ XMP metadata embedded successfully");
  } catch (err) {
    console.error("❌ Error embedding XMP metadata:", err);
    throw err;
  }
}

module.exports = embedXmp;
