const fs = require("fs");
const { PDFDocument } = require("pdf-lib");

(async () => {
  const pdfBytes = fs.readFileSync("./Order_10348230934851.pdf");
  const pdfDoc = await PDFDocument.load(pdfBytes);
  console.log("PDF Catalog:", pdfDoc.catalog.toString());
})();
