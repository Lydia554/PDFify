const fs = require("fs");
const path = require("path");
const { PDFDocument, PDFName, PDFString, PDFRawStream } = require("pdf-lib");
const zlib = require("zlib");

(async () => {
  const pdfPath = process.argv[2];
  if (!pdfPath) {
    console.error("❌ Please provide a PDF to inspect, e.g.:");
    console.error("   node inspect-pdf-af.js debug_steps/step5_final_zugferd.pdf");
    process.exit(1);
  }

  if (!fs.existsSync(pdfPath)) {
    console.error("❌ File not found:", pdfPath);
    process.exit(1);
  }

  const pdfData = fs.readFileSync(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfData, { ignoreEncryption: true });

  console.log(`✅ Loaded PDF: ${pdfPath}`);
  console.log(`📄 Pages: ${pdfDoc.getPageCount()}`);

  // --- Check /AF array in the catalog ---
  const afArray = pdfDoc.catalog.get(PDFName.of("AF"));
  if (!afArray) {
    console.warn("⚠️ No /AF (Associated Files) array found");
    return;
  }

  console.log(`📌 /AF array found with ${afArray.size} object(s)`);

  let extractedCount = 0;

  for (let i = 0; i < afArray.size; i++) {
    const fileSpecRef = afArray.lookup(i);
    const fileSpec = fileSpecRef.lookup();

    const fileName = fileSpec.get(PDFName.of("F"))?.value || `attached_${i}.xml`;
    const efDict = fileSpec.get(PDFName.of("EF"))?.lookup(PDFName.of("F"));

    if (!efDict || !(efDict instanceof PDFRawStream)) {
      console.warn(`⚠️ Object ${i} has no stream for EF/F`);
      continue;
    }

    let content = efDict.contents;
    const filter = efDict.dict.get(PDFName.of("Filter"))?.value;

    if (filter === "FlateDecode") {
      content = zlib.inflateSync(content);
    }

    const outPath = path.join(path.dirname(pdfPath), `extracted_${fileName}`);
    fs.writeFileSync(outPath, content);
    console.log(`✅ Extracted attached file to: ${outPath}`);
    extractedCount++;
  }

  if (extractedCount === 0) {
    console.warn("⚠️ No attached files extracted from /AF");
  } else {
    console.log(`🎯 Extraction complete: ${extractedCount} file(s)`);
  }
})();
