// test/embed-xmp-test.js
const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");
const embedXmpIntoPdf = require("../xmp/embedXmp");

// Path setup
const xmpPath = path.join(__dirname, "../xmp/zugferd.xmp");
const outputPdfPath = path.join(__dirname, "output-with-xmp.pdf");

async function testEmbedXmp() {
  // Create a blank PDF (or load one)
  const pdfDoc = await PDFDocument.create();

  const page = pdfDoc.addPage([400, 300]);
  page.drawText("This is a test PDF for XMP embedding", { x: 50, y: 150 });

  // Call your embed logic
  embedXmpIntoPdf(pdfDoc, xmpPath);

  // Save the result
  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPdfPath, pdfBytes);
  console.log("📄 Output PDF saved to:", outputPdfPath);
}

testEmbedXmp().catch(err => {
  console.error("❌ Test failed:", err);
});
