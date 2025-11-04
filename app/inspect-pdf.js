const fs = require("fs");
const path = require("path");
const { PDFDocument, PDFName, PDFRawStream } = require("pdf-lib");
const pako = require("pako"); // npm i pako

(async () => {
  try {
    const pdfPath = path.resolve("./debug_steps/step5_final_zugferd.pdf");
    const pdfBuffer = fs.readFileSync(pdfPath);
    const tmpDir = path.join(__dirname, "debug_steps");
    fs.mkdirSync(tmpDir, { recursive: true });

    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    console.log("✅ PDF loaded, pages:", pdfDoc.getPageCount());

    // --- 1️⃣ Extract XMP metadata if present ---
    const metadataObj = pdfDoc.catalog.get(PDFName.of("Metadata"));
    if (metadataObj instanceof PDFRawStream) {
      let xmlContent;
      const filter = metadataObj.dictionary.get(PDFName.of("Filter"))?.name;
      if (filter === "FlateDecode") {
        xmlContent = pako.inflate(metadataObj.contents, { to: "string" });
      } else {
        xmlContent = Buffer.from(metadataObj.contents).toString("utf-8");
      }
      const xmlPath = path.join(tmpDir, "xmp_metadata.xml");
      fs.writeFileSync(xmlPath, xmlContent);
      console.log("💾 XMP metadata saved to:", xmlPath);
    } else {
      console.log("⚠️ No XMP metadata found or not a PDFRawStream.");
    }

    // --- 2️⃣ Extract embedded ZUGFeRD XML ---
    const embeddedFilesDict = pdfDoc.catalog.get(PDFName.of("Names"))?.lookup(PDFName.of("EmbeddedFiles"));
    if (!embeddedFilesDict) {
      console.log("⚠️ No embedded files found in PDF.");
      return;
    }

    // Get the /Names array
    const namesArray = embeddedFilesDict.lookup(PDFName.of("Names"));
    if (!namesArray || !Array.isArray(namesArray)) {
      console.log("⚠️ Embedded /Names array missing or not an array.");
      return;
    }

    // Iterate over embedded files
    for (let i = 0; i < namesArray.length; i += 2) {
      const nameObj = namesArray[i];
      const fileSpecRef = namesArray[i + 1];
      const fileSpec = pdfDoc.context.lookup(fileSpecRef);

      // Get the EF dictionary
      const efDict = fileSpec.get(PDFName.of("EF"));
      if (!efDict) continue;

      // The actual file stream
      const fRef = efDict.get(PDFName.of("F"));
      const fileStream = pdfDoc.context.lookup(fRef);
      let fileData = fileStream.contents;

      // Decompress if FlateDecode
      const filter = fileStream.dictionary.get(PDFName.of("Filter"))?.name;
      if (filter === "FlateDecode") {
        fileData = pako.inflate(fileData, { to: "string" });
      } else {
        fileData = Buffer.from(fileData).toString("utf-8");
      }

      // Determine filename
      const fileNameObj = fileSpec.get(PDFName.of("F"));
      const fileName = fileNameObj?.value || `zugferd_${i / 2}.xml`;
      const filePath = path.join(tmpDir, fileName);

      fs.writeFileSync(filePath, fileData, { encoding: "utf-8" });
      console.log("💾 Extracted embedded XML:", filePath);
    }

    console.log("🎯 Extraction complete. Check 'debug_steps' folder.");
  } catch (err) {
    console.error("❌ PDF extraction failed:", err);
  }
})();