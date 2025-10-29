const fs = require("fs");
const zlib = require("zlib");
const { PDFDocument, PDFName } = require("pdf-lib");

async function inspectPdf(filePath) {
  const pdfBytes = fs.readFileSync(filePath);
  const pdfDoc = await PDFDocument.load(pdfBytes);

  const catalog = pdfDoc.catalog;
  const af = catalog.get(PDFName.of("AF"));
  if (!af) {
    console.log("❌ No Associated Files (AF) found. ZUGFeRD XML missing.");
    return;
  }

  console.log("✅ Associated Files (AF) found. Extracting files...");

  const afArray = pdfDoc.context.lookup(af);
  for (const ref of afArray.array) {
    const fileSpec = pdfDoc.context.lookup(ref);

    // File name
    const fname = fileSpec.get(PDFName.of("F")).value;
    const safeName = fname.replace(/[^a-zA-Z0-9_.-]/g, "_");

    // Get embedded file stream
    const ef = fileSpec.get(PDFName.of("EF"));
    const fStream = pdfDoc.context.lookup(ef.get(PDFName.of("F")));

    // Decompress if needed
    let xmlBytes;
    try {
      xmlBytes = zlib.inflateSync(fStream.getContents());
    } catch {
      // If not compressed, use raw bytes
      xmlBytes = fStream.getContents();
    }

    // Save XML to disk
    fs.writeFileSync(safeName, xmlBytes);
    console.log(`✅ Extracted embedded XML to: ${safeName}`);

    // Optional: preview first 500 characters
    console.log("  --- XML content preview ---");
    console.log(xmlBytes.toString("utf8").slice(0, 500));
  }
}

// Example usage
inspectPdf("./Order_10348230934851.pdf");
