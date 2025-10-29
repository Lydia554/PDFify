// -----------------------------
// inspectZugferd.js
// -----------------------------
const fs = require("fs");
const path = require("path");
const { PDFDocument, PDFName, PDFString } = require("pdf-lib");

/**
 * Inspect a PDF for embedded ZUGFeRD XML and extract it.
 *
 * @param {string|Buffer} input - Path to PDF or a Buffer
 * @returns {Promise<{ xml?: string, attachments: string[] }>}
 */
async function inspectZugferd(input) {
  let pdfBytes;

  if (Buffer.isBuffer(input)) {
    pdfBytes = input;
  } else if (typeof input === "string") {
    pdfBytes = fs.readFileSync(path.resolve(input));
  } else {
    throw new Error("Invalid input: must be a Buffer or a file path");
  }

  const pdfDoc = await PDFDocument.load(pdfBytes);
  const context = pdfDoc.context;
  const catalog = pdfDoc.catalog;

  let extractedXml = null;
  let attachmentNames = [];

  try {
    const namesDict = catalog.lookup(PDFName.of("Names"));
    if (namesDict) {
      const embeddedFiles = namesDict.lookup(PDFName.of("EmbeddedFiles"));
      if (embeddedFiles) {
        const namesArray = embeddedFiles.lookup(PDFName.of("Names"));
        if (namesArray) {
          const arr = namesArray.asArray();
          for (let i = 0; i < arr.length; i += 2) {
            const name = arr[i].decodeText ? arr[i].decodeText() : arr[i].toString();
            const fileSpec = arr[i + 1];
            attachmentNames.push(name);

            const efDict = fileSpec.lookup(PDFName.of("EF"));
            if (efDict) {
              const xmlStream = efDict.lookup(PDFName.of("F"));
              if (xmlStream) {
                const streamContent = xmlStream.lookup(PDFName.of("Filter"))
                  ? xmlStream.getUncompressedContents()
                  : xmlStream.getContents();

                const xml = streamContent.toString("utf8");
                if (name.endsWith(".xml") && xml.includes("<CrossIndustryInvoice")) {
                  extractedXml = xml;
                }
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("❌ Error inspecting PDF:", err);
  }

  if (extractedXml) {
    console.log("✅ Found embedded ZUGFeRD XML!");
    const outPath = path.join(
      path.dirname(path.resolve(input)),
      "extracted_zugferd.xml"
    );
    fs.writeFileSync(outPath, extractedXml, "utf8");
    console.log(`📄 Extracted XML written to: ${outPath}`);
  } else {
    console.warn("⚠️ No ZUGFeRD XML found in PDF.");
  }

  return { xml: extractedXml, attachments: attachmentNames };
}


if (require.main === module) {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node inspectZugferd.js <path-to-pdf>");
    process.exit(1);
  }
  inspectZugferd(file).then((res) => {
    console.log("Attachments:", res.attachments);
    if (res.xml) console.log("First 300 chars of XML:\n", res.xml.slice(0, 300));
  });
}

module.exports = { inspectZugferd };
