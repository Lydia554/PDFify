const fs = require("fs");
const { PDFName } = require("pdf-lib");

function embedXmpIntoPdf(pdfDoc, xmpPath) {
  const catalog = pdfDoc.catalog;

  try {
    const rawXmp = fs.readFileSync(xmpPath, "utf-8");
    console.log("📂 Raw XMP loaded:", rawXmp.slice(0, 100), "...");

    
    const sanitizedXmp = rawXmp.trim();


    const cleanBuffer = Buffer.from(sanitizedXmp, "utf-8");

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
