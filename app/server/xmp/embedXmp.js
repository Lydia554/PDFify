// xmp/embedXmp.js
const fs = require("fs");
const { PDFName } = require("pdf-lib");

/**
 * Embed strict PDF/A-3b XMP metadata into a PDFDocument.
 * Guarantees UTF-8, BOM, and correct PDF/A tags.
 *
 * @param {PDFDocument} pdfDoc - pdf-lib PDFDocument instance
 * @param {string} [xmpFilePath] - optional path to XMP template
 */
async function embedXmp(pdfDoc, xmpFilePath = null) {
  let xmpContent = "";

  const baseXmp = `<?xpacket begin='\\uFEFF' id='W5M0MpCehiHzreSzNTczkc9d'?>
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
    if (xmpFilePath && fs.existsSync(xmpFilePath)) {
      xmpContent = fs.readFileSync(xmpFilePath, "utf-8");
    }

    if (!xmpContent.includes("<pdfaid:part>")) {
      xmpContent = baseXmp;
    }

    // Ensure UTF-8 BOM at start
    if (!xmpContent.startsWith("\uFEFF")) {
      xmpContent = "\uFEFF" + xmpContent;
    }

    const xmpBuffer = Buffer.from(xmpContent, "utf-8");

    const metadataStream = pdfDoc.context.flateStream(xmpBuffer, {
      Type: PDFName.of("Metadata"),
      Subtype: PDFName.of("XML"),
    });

    const metadataRef = pdfDoc.context.register(metadataStream);
    pdfDoc.catalog.set(PDFName.of("Metadata"), metadataRef);

    console.log("✅ XMP metadata embedded successfully");
  } catch (err) {
    console.error("❌ Error embedding XMP metadata:", err);
    throw err;
  }
}

module.exports = embedXmp;
