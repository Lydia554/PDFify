const fs = require("fs");
const { PDFDocument, PDFName, PDFArray } = require("pdf-lib");

async function inspectPdf(filePath) {
  const pdfBytes = fs.readFileSync(filePath);
  const pdfDoc = await PDFDocument.load(pdfBytes);

  const catalog = pdfDoc.catalog;
  const afRef = catalog.get(PDFName.of("AF"));
  if (!afRef) {
    console.log("❌ No Associated Files (AF) found. ZUGFeRD XML missing.");
    return;
  }

  // Lookup AF array
  const afArray = pdfDoc.context.lookup(afRef);
  let refs = [];
  if (afArray instanceof PDFArray) {
    refs = afArray.asArray();
  } else if (Array.isArray(afArray)) {
    refs = afArray;
  } else {
    refs = [afArray];
  }

  console.log("✅ Associated Files (AF) found. Checking names...");

  for (const ref of refs) {
    const fileSpec = pdfDoc.context.lookup(ref);
    const fname = fileSpec.get(PDFName.of("F"))?.value || "unknown.xml";
    console.log("- Embedded file:", fname);

    const efDict = fileSpec.get(PDFName.of("EF"));
    if (!efDict) {
      console.log("  ❌ EF dictionary missing for this file");
      continue;
    }

    const fStreamRef = efDict.get(PDFName.of("F"));
    const fStream = pdfDoc.context.lookup(fStreamRef);

    const xmlBytes = fStream.getContents(); // pdf-lib automatically decompresses

    // Save to disk
    const outputPath = `./extracted-${fname}`;
    fs.writeFileSync(outputPath, xmlBytes);
    console.log(`✅ XML extracted to: ${outputPath}`);

    console.log("  --- XML preview ---");
    console.log(xmlBytes.toString("utf8").slice(0, 500)); // first 500 chars
  }
}

// Usage
inspectPdf("./Order_10348230934851.pdf");
