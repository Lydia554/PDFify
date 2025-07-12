const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");
const embedXmpIntoPdf = require("../xmp/embedXmp");

const xmpPath = path.join(__dirname, "../xmp/zugferd.xmp");
const outputPdfPath = path.join(__dirname, "output-with-xmp.pdf");

async function testEmbedXmp() {
  debugger;  // Pauses right when the function starts

  const pdfDoc = await PDFDocument.create();
  debugger;  // After PDF created

  const page = pdfDoc.addPage([400, 300]);
  page.drawText("This is a test PDF for XMP embedding", { x: 50, y: 150 });
  debugger;  // After page is added and text drawn

  await embedXmpIntoPdf(pdfDoc, xmpPath);  // Note the await here
  debugger;  // After XMP embedded

  const pdfBytes = await pdfDoc.save();
  debugger;  // After PDF bytes saved to variable

  fs.writeFileSync(outputPdfPath, pdfBytes);
  console.log("📄 Output PDF saved to:", outputPdfPath);
}

testEmbedXmp().catch(err => {
  console.error("❌ Test failed:", err);
});
