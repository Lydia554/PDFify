// xmp/embedXmp.js
const fs = require("fs");
const { PDFDocument, PDFName } = require("pdf-lib");

function embedXmpIntoPdf(pdfDoc, xmpPath) {
  const catalog = pdfDoc.catalog;

  try {
    const rawXmp = fs.readFileSync(xmpPath, "utf-8");
    console.log("📂 Raw XMP loaded:", rawXmp.slice(0, 100), "...");

    // Optional: sanitize here if needed
    const sanitizedXmp = rawXmp; // or sanitizeXmp(rawXmp);

    const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
    const cleanBuffer = Buffer.concat([bom, Buffer.from(sanitizedXmp, "utf-8")]);

    console.log("📦 Clean XMP buffer created, length:", cleanBuffer.length);

    const metadataStream = pdfDoc.context.flateStream(cleanBuffer, {
      Type: PDFName.of("Metadata"),
      Subtype: PDFName.of("XML"),
      Filter: PDFName.of("FlateDecode"),
    });

    const metadataRef = pdfDoc.context.register(metadataStream);
    catalog.set(PDFName.of("Metadata"), metadataRef);

    console.log("✅ XMP embedded successfully");
  } catch (err) {
    console.error("❌ XMP embedding failed:", err);
    throw err;
  }
}

module.exports = embedXmpIntoPdf;
