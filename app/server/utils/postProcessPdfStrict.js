const { PDFDocument, PDFName } = require("pdf-lib");
const fs = require("fs");
const crypto = require("crypto");

/**
 * Post-process PDF/A-3b PDF:
 * - Embed ZUGFeRD XML
 * - Embed strict XMP metadata (from template if provided)
 * - Preserve OutputIntents
 * - Add Trailer ID for VeraPDF compliance
 *
 * @param {Uint8Array|Buffer} pdfBytes
 * @param {string|null} zugferdXml
 * @param {object} localeMeta - { title, creator, language }
 * @param {string|null} xmpTemplatePath - optional path to strict XMP template
 */
async function postProcessPdfStrict(pdfBytes, zugferdXml = null, localeMeta = {}, xmpTemplatePath = null) {
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // --- Preserve /OutputIntents ---
  const existingOutputIntentsRef = pdfDoc.catalog.get(PDFName.of("OutputIntents"));
  let outputIntents = null;
  if (existingOutputIntentsRef) {
    outputIntents = pdfDoc.context.lookup(existingOutputIntentsRef);
  }

  // --- Embed ZUGFeRD XML if provided ---
  if (zugferdXml) {
    const zugferdStream = pdfDoc.context.register(
      pdfDoc.context.stream(Buffer.from(zugferdXml, "utf8"))
    );

    const zugferdFileSpec = pdfDoc.context.register(
      pdfDoc.context.obj({
        Type: PDFName.of("Filespec"),
        F: PDFName.of("zugferd-invoice.xml"),
        EF: pdfDoc.context.obj({ F: zugferdStream }),
        AFRelationship: PDFName.of("Alternative"),
      })
    );

    let afArray = pdfDoc.catalog.get(PDFName.of("AF"));
    if (!afArray) {
      afArray = pdfDoc.context.obj([zugferdFileSpec]);
    } else {
      afArray = pdfDoc.context.lookup(afArray);
      const hasZugferd = afArray.some(ref => {
        const fsObj = pdfDoc.context.lookup(ref);
        const fileName = fsObj.get(PDFName.of("F"));
        return fileName && fileName.value === "zugferd-invoice.xml";
      });
      if (!hasZugferd) afArray.push(zugferdFileSpec);
    }
    pdfDoc.catalog.set(PDFName.of("AF"), afArray);
    console.log("📦 ZUGFeRD XML attached");
  }

  // --- Embed strict XMP ---
  let xmpContent = "";
  if (xmpTemplatePath && fs.existsSync(xmpTemplatePath)) {
    xmpContent = fs.readFileSync(xmpTemplatePath, "utf8");
  } else {
    // fallback minimal PDF/A-3b packet
    xmpContent = `<?xpacket begin='\uFEFF' id='W5M0MpCehiHzreSzNTczkc9d'?>
<x:xmpmeta xmlns:x='adobe:ns:meta/' x:xmptk='PDFify'>
  <rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>
    <rdf:Description rdf:about='' xmlns:pdfaid='http://www.aiim.org/pdfa/ns/id/'>
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end='w'?>`;
  }

  // Insert dynamic metadata if requested
  const { title = "Invoice", creator = "PDFify", language = "en" } = localeMeta;
  xmpContent = xmpContent
    .replace(/<dc:title>.*<\/dc:title>/, `<dc:title>${title}</dc:title>`)
    .replace(/<dc:creator>.*<\/dc:creator>/, `<dc:creator>${creator}</dc:creator>`)
    .replace(/<dc:language>.*<\/dc:language>/, `<dc:language>${language}</dc:language>`);

  // Ensure UTF-8 BOM
  if (!xmpContent.startsWith("\uFEFF")) xmpContent = "\uFEFF" + xmpContent;

  // Embed XMP as FlateDecode stream
  const metadataStream = pdfDoc.context.flateStream(Buffer.from(xmpContent, "utf8"), {
    Type: PDFName.of("Metadata"),
    Subtype: PDFName.of("XML"),
  });
  const metadataRef = pdfDoc.context.register(metadataStream);
  pdfDoc.catalog.set(PDFName.of("Metadata"), metadataRef);
  console.log("📄 Strict XMP metadata embedded");

  // --- Add Trailer ID ---
  const id = crypto.randomBytes(16).toString("hex");
  pdfDoc.catalog.set(PDFName.of("ID"), pdfDoc.context.obj([
    PDFName.of(id),
    PDFName.of(id)
  ]));
  console.log("🆔 Trailer ID added");

  // --- Restore /OutputIntents ---
  if (outputIntents) {
    pdfDoc.catalog.set(PDFName.of("OutputIntents"), outputIntents);
    console.log("🎨 /OutputIntents preserved");
  }

  return await pdfDoc.save({ useObjectStreams: false });
}

module.exports = { postProcessPdfStrict };
