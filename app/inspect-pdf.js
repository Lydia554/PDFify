const fs = require("fs");
const path = require("path");
const { PDFDocument, PDFName, PDFRawStream } = require("pdf-lib");
const pako = require("pako"); // npm i pako

(async () => {
  try {
const pdfPath = path.resolve("./debug_steps/step5_final_zugferd.pdf"); // your PDF
    const pdfBuffer = fs.readFileSync(pdfPath);

    const tmpDir = path.join(__dirname, "debug_steps");
    fs.mkdirSync(tmpDir, { recursive: true });

    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    console.log("✅ PDF loaded, pages:", pdfDoc.getPageCount());

    // --- 1️⃣ Extract XMP metadata ---
    const metadataRef = pdfDoc.catalog.get(PDFName.of("Metadata"));
    if (metadataRef instanceof PDFRawStream) {
      let xmlContent;
      const filter = metadataRef.dictionary.get(PDFName.of("Filter"))?.name;
      if (filter === "FlateDecode") {
        xmlContent = pako.inflate(metadataRef.contents, { to: "string" });
      } else {
        xmlContent = Buffer.from(metadataRef.contents).toString("utf-8");
      }
      const xmlPath = path.join(tmpDir, "xmp_metadata.xml");
      fs.writeFileSync(xmlPath, xmlContent, "utf-8");
      console.log("💾 XMP metadata saved:", xmlPath);
    } else {
      console.log("⚠️ No XMP metadata found or not a PDFRawStream.");
    }

    // --- 2️⃣ Extract embedded ZUGFeRD XML ---
    const namesDictRef = pdfDoc.catalog.get(PDFName.of("Names"));
    if (!namesDictRef) {
      console.log("⚠️ No /Names dictionary found.");
      return;
    }

    const namesDict = pdfDoc.context.lookup(namesDictRef);
    const embeddedFilesDictRef = namesDict.lookup(PDFName.of("EmbeddedFiles"));
    if (!embeddedFilesDictRef) {
      console.log("⚠️ No /EmbeddedFiles found.");
      return;
    }

    const embeddedFilesDict = pdfDoc.context.lookup(embeddedFilesDictRef);
    const namesArrayRef = embeddedFilesDict.get(PDFName.of("Names"));
    const namesArray = pdfDoc.context.lookup(namesArrayRef);
    if (!Array.isArray(namesArray)) {
      console.log("⚠️ Embedded /Names array missing or invalid.");
      return;
    }

    for (let i = 0; i < namesArray.length; i += 2) {
      const fileNameObj = namesArray[i];
      const fileSpecRef = namesArray[i + 1];
      const fileSpec = pdfDoc.context.lookup(fileSpecRef);

      const efDictRef = fileSpec.get(PDFName.of("EF"));
      if (!efDictRef) continue;
      const efDict = pdfDoc.context.lookup(efDictRef);
      const fRef = efDict.get(PDFName.of("F"));
      const fileStream = pdfDoc.context.lookup(fRef);

      let fileData = fileStream.contents;
      const filter = fileStream.dictionary.get(PDFName.of("Filter"));
      if (filter?.name === "FlateDecode" || (Array.isArray(filter) && filter[0].name === "FlateDecode")) {
        fileData = pako.inflate(fileData, { to: "string" });
      } else {
        fileData = Buffer.from(fileData).toString("utf-8");
      }

      const decodedFileName = fileSpec.get(PDFName.of("F"))?.decodeText?.() || `zugferd_${i / 2}.xml`;
      const filePath = path.join(tmpDir, decodedFileName);
      fs.writeFileSync(filePath, fileData, "utf-8");
      console.log("💾 Extracted embedded XML:", filePath);
    }

    console.log("🎯 Extraction complete. Check 'debug_steps' folder.");
  } catch (err) {
    console.error("❌ PDF extraction failed:", err);
  }
})();
