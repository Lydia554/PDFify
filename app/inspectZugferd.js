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

  console.log("✅ Associated Files (AF) found. Checking names...");

  const afArray = pdfDoc.context.lookup(af);
  for (const ref of afArray.array) {
    const fileSpec = pdfDoc.context.lookup(ref);
    const fname = fileSpec.get(PDFName.of("F"));
    console.log("- Embedded file:", fname.value);

    const ef = fileSpec.get(PDFName.of("EF"));
    const fStream = pdfDoc.context.lookup(ef.get(PDFName.of("F")));

    // Extract compressed bytes
    const compressedBytes = fStream.getContents();
    const xmlBytes = zlib.inflateSync(compressedBytes); // decompress

    console.log("  --- XML content preview ---");
    console.log(xmlBytes.toString("utf8").slice(0, 500)); // first 500 chars
  }
}

inspectPdf("./Order_10348230934851.pdf");
