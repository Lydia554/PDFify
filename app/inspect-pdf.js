const fs = require("fs");
const path = require("path");
const { PDFDocument, PDFName } = require("pdf-lib");
const pako = require("pako"); // npm i pako

(async () => {
  try {
    const pdfPath = path.resolve("./debug_steps/step5_final_zugferd.pdf");
    const pdfBuffer = fs.readFileSync(pdfPath);
    const tmpDir = path.join(__dirname, "debug_steps");
    fs.mkdirSync(tmpDir, { recursive: true });

    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    console.log("✅ PDF loaded, pages:", pdfDoc.getPageCount());

    // --- Extract embedded ZUGFeRD XML ---
    const embeddedFilesDict = pdfDoc.catalog.get(PDFName.of("Names"))?.lookup(PDFName.of("EmbeddedFiles"));
    if (!embeddedFilesDict) {
      console.log("⚠️ No embedded files found in PDF.");
      return;
    }

    const namesArray = embeddedFilesDict.lookup(PDFName.of("Names"));
    if (!namesArray || !Array.isArray(namesArray)) {
      console.log("⚠️ Embedded /Names array missing or not an array.");
      return;
    }

    for (let i = 0; i < namesArray.length; i += 2) {
      const nameObj = namesArray[i];
      const fileSpecRef = namesArray[i + 1];
      const fileSpec = pdfDoc.context.lookup(fileSpecRef);

      const efDict = fileSpec.get(PDFName.of("EF"));
      if (!efDict) continue;

      const fRef = efDict.get(PDFName.of("F"));
      const fileStream = pdfDoc.context.lookup(fRef);
      let fileData = fileStream.contents;

      const filter = fileStream.dictionary.get(PDFName.of("Filter"))?.name;
      if (filter === "FlateDecode") {
        fileData = pako.inflate(fileData); // returns Uint8Array
      }

      // --- Correctly handle UTF-16 BOM ---
      let xmlString;
      if (fileData[0] === 0xFE && fileData[1] === 0xFF) {
        // UTF-16BE
        xmlString = Buffer.from(fileData).toString("utf16be");
      } else if (fileData[0] === 0xFF && fileData[1] === 0xFE) {
        // UTF-16LE
        xmlString = Buffer.from(fileData).toString("utf16le");
      } else {
        // fallback UTF-8
        xmlString = Buffer.from(fileData).toString("utf-8");
      }

      const fileNameObj = fileSpec.get(PDFName.of("F"));
      const fileName = fileNameObj?.value || `zugferd_${i / 2}.xml`;
      const filePath = path.join(tmpDir, fileName);

      fs.writeFileSync(filePath, xmlString, { encoding: "utf-8" });
      console.log("💾 Extracted embedded XML (UTF-16 decoded):", filePath);
    }

    console.log("🎯 Extraction complete. Check 'debug_steps' folder.");
  } catch (err) {
    console.error("❌ PDF extraction failed:", err);
  }
})();
