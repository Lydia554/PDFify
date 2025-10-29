const fs = require("fs");
const path = require("path");
const {
  generateZugferdXML,
  finalizePdfWithXml,
} = require("./server/Helpers/pdf-helpers"); // updated path

async function testFinalize() {
  // 1️⃣ Load a sample PDF
  const originalPdfPath = path.join(__dirname, "Order_10348230934851.pdf");
  if (!fs.existsSync(originalPdfPath)) {
    console.error("❌ Original PDF not found!");
    return;
  }
  const originalPdfBuffer = fs.readFileSync(originalPdfPath);

  // 2️⃣ Generate a small test ZUGFeRD XML
  const zugXml = generateZugferdXML({
    source: "shopify",
    invoiceNumber: "1129",
    date: "2025-10-29",
    items: [
      { name: "Test Product", quantity: 1, unitPrice: 100, taxRate: 21 },
    ],
  });

  // 3️⃣ Finalize PDF (PDF/A-3b + XML)
  const finalBuffer = await finalizePdfWithXml(originalPdfBuffer, zugXml);

  console.log("✅ Test complete. Check 'final_with_xml.pdf'");
}

testFinalize().catch(console.error);
