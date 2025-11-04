const fs = require("fs");
const path = require("path");
const { PDFDocument, PDFName } = require("pdf-lib");

(async () => {
  try {
    const tmpDir = path.join(__dirname, "debug_steps");
    fs.mkdirSync(tmpDir, { recursive: true });

    const invoiceData = {
      orderId: "DEBUG-TEST",
      date: new Date().toISOString().slice(0, 10),
      items: [{ name: "Test Item", quantity: 1, price: 10, net: 10, tax: 2, total: 12, taxRate: 21 }],
      subtotal: 10,
      tax: 2,
      total: 12,
      vatRate: 21,
      customerName: "Test Customer",
      iban: "DE89370400440532013000",
      bic: "COBADEFFXXX",
      paymentTerms: "Due within 14 days",
      creator: "PDFify",
      locale: { language: "en" },
    };

    // 1️⃣ Generate base PDF
    const pdfBuffer = await require("./server/routes/shopify/shopifyMerchantTemplate").createBasePdf(invoiceData);
    const step1Path = path.join(tmpDir, "step1_base.pdf");
    fs.writeFileSync(step1Path, pdfBuffer);
    console.log("✅ Step 1: Base PDF saved:", step1Path, "size:", pdfBuffer.length, "bytes");

    // 2️⃣ Load PDF and inspect
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    console.log("✅ PDFDocument loaded successfully");
    console.log("Pages:", pdfDoc.getPageCount());

    // Inspect trailer info
    console.log("Trailer Info:", pdfDoc.context.trailerInfo);

    // Inspect /Info dictionary
    const infoRef = pdfDoc.context.trailerInfo.Info;
    if (infoRef) {
      const infoDict = pdfDoc.context.lookup(infoRef);
      console.log("Detailed /Info dictionary (raw):", infoDict);

      // Map keys to strings if possible
      if (infoDict?.map) {
        console.log("Detailed /Info key-values:");
        for (const [key, value] of infoDict.map) {
          console.log(`  ${key?.name || key}:`, value?.toString?.() || value);
        }
      }
    } else {
      console.log("No /Info dictionary present.");
    }

    // Inspect catalog keys
    console.log("Catalog Keys:", pdfDoc.catalog.keys());

    // Check if metadata exists
    const metadata = pdfDoc.catalog.get(PDFName.of("Metadata"));
    console.log("Metadata object exists:", !!metadata);

    console.log("🎯 Base PDF inspection complete. Open the PDF in a viewer to check for visual errors.");

  } catch (err) {
    console.error("❌ Debug script failed:", err);
  }
})();
