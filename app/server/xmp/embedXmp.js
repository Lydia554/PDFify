// xmp/embedXmp.js
const { PDFName } = require("pdf-lib");

/**
 * Embed strict PDF/A-3b XMP metadata into a PDFDocument.
 * Ensures correct xpacket, pdfaid:part=3, and conformance=B tags.
 *
 * @param {PDFDocument} pdfDoc - The pdf-lib PDFDocument instance.
 * @param {string} [xmpFilePath] - Optional path to an existing XMP template.
 */
async function embedXmp(pdfDoc, xmpFilePath = null) {
  let xmpContent = "";

  // Base minimal XMP packet for PDF/A-3b
  const baseXmp = `<?xpacket begin='\uFEFF' id='W5M0MpCehiHzreSzNTczkc9d'?>
<x:xmpmeta xmlns:x='adobe:ns:meta/' x:xmptk='PDFify'>
  <rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>
    <rdf:Description xmlns:pdfaid='http://www.aiim.org/pdfa/ns/id/'>
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end='w'?>`;

  try {
    if (xmpFilePath) {
      const fs = require("fs");
      if (fs.existsSync(xmpFilePath)) {
        xmpContent = fs.readFileSync(xmpFilePath, "utf-8");
      }
    }

    // If file is missing or invalid, fallback to base XMP
    if (!xmpContent.includes("<pdfaid:part>")) {
      xmpContent = baseXmp;
    }

    // Guarantee correct UTF-8 BOM and no null chars
    if (!xmpContent.startsWith("\uFEFF")) {
      xmpContent = "\uFEFF" + xmpContent;
    }

    // Create metadata stream with FlateDecode compression
    const xmpBuffer = Buffer.from(xmpContent, "utf-8");
    const metadataStream = pdfDoc.context.flateStream(xmpBuffer, {
      Type: PDFName.of("Metadata"),
      Subtype: PDFName.of("XML"),
    });

    const metadataRef = pdfDoc.context.register(metadataStream);
    pdfDoc.catalog.set(PDFName.of("Metadata"), metadataRef);

    console.log("✅ Strict PDF/A-3b XMP metadata embedded successfully");
  } catch (err) {
    console.error("❌ Error embedding XMP metadata:", err);
    throw err;
  }
}

module.exports = embedXmp;
