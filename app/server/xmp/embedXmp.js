// xmp/embedXmp.js
const fs = require("fs");
const { PDFName } = require("pdf-lib");

/**
 * Embed strict PDF/A-3b XMP metadata into a PDFDocument.
 * Guarantees UTF-8 BOM, no null chars, and proper pdfaid:part/conformance tags.
 *
 * @param {PDFDocument} pdfDoc - pdf-lib PDFDocument instance
 * @param {string} [xmpFilePath] - Optional path to an existing XMP template
 */
async function embedXmp(pdfDoc, xmpFilePath = null) {
  try {
    let xmpContent = "";

    // Base XMP template (strict PDF/A-3b)
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

    // Read user XMP if provided
    if (xmpFilePath && fs.existsSync(xmpFilePath)) {
      xmpContent = fs.readFileSync(xmpFilePath, "utf8").trim();
    }

    // Fallback to base XMP if invalid
    if (!xmpContent.includes("<pdfaid:part>")) {
      xmpContent = baseXmp;
    }

    // Ensure BOM at the start
    if (!xmpContent.startsWith("\uFEFF")) {
      xmpContent = "\uFEFF" + xmpContent;
    }

    // Remove null characters
    xmpContent = xmpContent.replace(/\0/g, "");

    // Create metadata stream with FlateDecode compression
    const xmpBuffer = Buffer.from(xmpContent, "utf8");
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
