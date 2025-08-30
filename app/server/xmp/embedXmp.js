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
    
    // Ensure proper UTF-8 BOM and XML structure
    let cleanXmp = rawXmp;
    if (!cleanXmp.startsWith('\uFEFF')) {
      cleanXmp = '\uFEFF' + cleanXmp;
    }
    
    // Validate basic XML structure
    if (!cleanXmp.includes('<?xml') && !cleanXmp.includes('<?xpacket')) {
      throw new Error('Invalid XMP structure: missing XML declaration or xpacket');
    }

    // Create metadata stream with proper UTF-8 encoding
    const xmpBuffer = Buffer.from(cleanXmp, "utf-8");
    const metadataStream = pdfDoc.context.flateStream(xmpBuffer, {
      Type: PDFName.of("Metadata"),
      Subtype: PDFName.of("XML"),
      Filter: PDFName.of("FlateDecode"),
    });

    const metadataRef = pdfDoc.context.register(metadataStream);
    catalog.set(PDFName.of("Metadata"), metadataRef);

    console.log("✅ XMP metadata embedded successfully with UTF-8 BOM");
  } catch (err) {
    console.error("❌ Error embedding XMP metadata:", err);
    throw err;
  }
}

module.exports = embedXmp;
