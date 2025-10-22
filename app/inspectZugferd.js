const fs = require("fs");
const { PDFDocument, PDFName } = require("pdf-lib");

async function inspectPdf(pdfPath) {
  const pdfBytes = fs.readFileSync(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);

  const catalog = pdfDoc.catalog;
  const afEntry = catalog.get(PDFName.of("AF"));

  if (!afEntry) {
    console.log("❌ No Associated Files (AF) found. ZUGFeRD XML missing.");
    return;
  }

  console.log("✅ Associated Files (AF) found. Checking names...");

  const afArray = afEntry.array || [];
  for (let i = 0; i < afArray.length; i++) {
    const fileSpecRef = afArray[i];
    const fileSpec = pdfDoc.context.lookup(fileSpecRef);
    const fileName = fileSpec.get(PDFName.of("F"))?.value || fileSpec.get(PDFName.of("UF"))?.value;
    console.log(`- Embedded file: ${fileName}`);

    // Optional: Inspect XML content
    const xmlStream = fileSpec.get(PDFName.of("EF")).get(PDFName.of("F"));
    const xmlBytes = pdfDoc.context.lookup(xmlStream).decode();
    console.log("Embedded XML preview:\n", xmlBytes.toString().slice(0, 300), "...");
  }
}

// Windows path — escape backslashes or use forward slashes
const pdfPath = "C:/Users/goldb/Pro/PDF-API/app/Order_10348230934851.pdf";
inspectPdf(pdfPath);
