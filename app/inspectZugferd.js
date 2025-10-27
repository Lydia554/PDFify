const fs = require("fs");
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
    const fname = fileSpec.get(PDFName.of("F"))?.value || "unknown.xml";
    console.log("- Embedded file:", fname);

    const ef = fileSpec.get(PDFName.of("EF"));
    const fStream = pdfDoc.context.lookup(ef.get(PDFName.of("F")));
    const xmlBytes = fStream.getContents(); // already decoded

    // Optionally save to disk
    const outputPath = `./extracted-${fname}`;
    fs.writeFileSync(outputPath, xmlBytes);
    console.log(`✅ XML extracted to: ${outputPath}`);

    console.log("  --- XML preview ---");
    console.log(xmlBytes.toString("utf8").slice(0, 500)); // first 500 chars
  }
}

// Usage
inspectPdf("./Order_10348230934851.pdf");
