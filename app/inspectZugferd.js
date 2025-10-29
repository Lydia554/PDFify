const fs = require("fs");
const path = require("path");
const { generateZugferdXML, finalizePdfWithXml, makePdfA3b } = require("./server/Helpers/pdf-helpers"); // adjust path

async function testFinalize() {
  // 1️⃣ Load sample PDF
  const originalPdfPath = path.join(__dirname, "Order_10348230934851.pdf");
  const originalPdfBuffer = fs.readFileSync(originalPdfPath);

  // 2️⃣ Generate ZUGFeRD XML
  const zugferdXml = generateZugferdXML({
    invoiceNumber: "1129",
    date: "2025-10-29",
    source: "shopify",
    items: [
      { name: "Item A", quantity: 1, unitPrice: 100, taxRate: 21 },
      { name: "Item B", quantity: 2, unitPrice: 50, taxRate: 21 }
    ]
  });

  // 3️⃣ Save PDF with XML BEFORE Ghostscript
  const preGsPath = path.join(__dirname, "check_before_gs.pdf");
  const preGsPdf = await finalizePdfWithXml(originalPdfBuffer, zugferdXml, { skipGs: true });
  fs.writeFileSync(preGsPath, preGsPdf);
  console.log("✅ Saved check_before_gs.pdf");

  // 4️⃣ Inspect embedded XML
  console.log("📄 Inspecting embedded XML in pre-GS PDF...");
  const { PDFDocument, PDFName } = require("pdf-lib");
  const pdfDoc = await PDFDocument.load(preGsPdf);
  const af = pdfDoc.catalog.get(PDFName.of("AF"));
  if (!af) return console.log("❌ No AF found.");

  const afArray = pdfDoc.context.lookup(af);
  for (const ref of afArray.array) {
    const fileSpec = pdfDoc.context.lookup(ref);
    const fname = fileSpec.get(PDFName.of("F")).value;
    console.log(`- Embedded file: ${fname}`);
  }

  // 5️⃣ Run Ghostscript on the saved PDF file
  console.log("📄 Converting to PDF/A-3b with Ghostscript...");
  const finalBuffer = await makePdfA3b(fs.readFileSync(preGsPath));
  fs.writeFileSync(path.join(__dirname, "final_with_xml.pdf"), finalBuffer);
  console.log("✅ Final PDF/A-3b saved: final_with_xml.pdf");
}

testFinalize().catch(console.error);
