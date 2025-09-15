const { PDFDocument, PDFName, PDFString, PDFArray, PDFHexString } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Post-process PDF to strict PDF/A-3b standard for Pro users
 * - Preserves /OutputIntents
 * - Adds Trailer ID
 * - Embeds ZUGFeRD XML
 * - Embeds verified XMP metadata from template with dynamic fields
 *
 * @param {Buffer} pdfBytes - PDF buffer from Puppeteer/Ghostscript
 * @param {string|null} zugferdXml - Optional ZUGFeRD XML string
 * @param {Object} localeMeta - { title, creator, language }
 * @param {string|null} xmpTemplatePath - Optional path to your .xmp template
 * @returns {Buffer} final PDF
 */
async function postProcessPdfStrict(pdfBytes, zugferdXml = null, localeMeta = {}, xmpTemplatePath = null) {
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // --- Preserve existing /OutputIntents ---
  const existingOutputIntentsRef = pdfDoc.catalog.get(PDFName.of('OutputIntents'));
  let outputIntents = null;
  if (existingOutputIntentsRef) {
    outputIntents = pdfDoc.context.lookup(existingOutputIntentsRef, PDFArray);
  }

  // --- Attach ZUGFeRD XML if provided ---
  if (zugferdXml) {
    const zugferdStream = pdfDoc.context.register(
      pdfDoc.context.stream(Buffer.from(zugferdXml, 'utf8'))
    );

    const zugferdFileSpec = pdfDoc.context.register(
      pdfDoc.context.obj({
        Type: PDFName.of('Filespec'),
        F: PDFString.of('zugferd-invoice.xml'),
        EF: pdfDoc.context.obj({ F: zugferdStream }),
        AFRelationship: PDFName.of('Alternative')
      })
    );

    let afArray = pdfDoc.catalog.get(PDFName.of('AF'));
    if (!afArray) {
      afArray = pdfDoc.context.obj([zugferdFileSpec]);
    } else {
      afArray = pdfDoc.context.lookup(afArray, PDFArray);
      const hasZugferd = afArray.some(ref => {
        const fsObj = pdfDoc.context.lookup(ref);
        const fileName = fsObj.get(PDFName.of('F'));
        return fileName && fileName.value === 'zugferd-invoice.xml';
      });
      if (!hasZugferd) afArray.push(zugferdFileSpec);
    }

    pdfDoc.catalog.set(PDFName.of('AF'), afArray);
    console.log('📦 ZUGFeRD XML attached');
  }

  // --- Add Trailer ID (Fix VeraPDF missing ID flag) ---
  const id = crypto.randomBytes(16).toString('hex');
  pdfDoc.catalog.set(PDFName.of('ID'), pdfDoc.context.obj([
    PDFHexString.fromText(id),
    PDFHexString.fromText(id)
  ]));
  console.log('🆔 Trailer ID added');

  // --- Embed verified XMP metadata ---
  const { title = 'Invoice', creator = 'PDFify', language = 'en' } = localeMeta;
  let xmpContent = '';

  if (xmpTemplatePath && fs.existsSync(xmpTemplatePath)) {
    xmpContent = fs.readFileSync(xmpTemplatePath, 'utf-8');
  } else {
    // fallback minimal XMP
    xmpContent = `<?xpacket begin='\uFEFF' id='W5M0MpCehiHzreSzNTczkc9d'?>
<x:xmpmeta xmlns:x='adobe:ns:meta/' x:xmptk='PDF-Lib'>
  <rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>
    <rdf:Description xmlns:pdfaid='http://www.aiim.org/pdfa/ns/id/'>
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end='w'?>`;
  }

  // Inject dynamic fields into XMP (title, creator, language)
  xmpContent = xmpContent.replace(/<dc:title>.*?<\/dc:title>/, `<dc:title>${title}</dc:title>`)
                         .replace(/<dc:creator>.*?<\/dc:creator>/, `<dc:creator>${creator}</dc:creator>`)
                         .replace(/<dc:language>.*?<\/dc:language>/, `<dc:language>${language}</dc:language>`);

  if (!xmpContent.startsWith('\uFEFF')) xmpContent = '\uFEFF' + xmpContent;

  const xmpStream = pdfDoc.context.register(
    pdfDoc.context.stream(Buffer.from(xmpContent, 'utf-8'), {
      Type: PDFName.of('Metadata'),
      Subtype: PDFName.of('XML')
    })
  );
  pdfDoc.catalog.set(PDFName.of('Metadata'), xmpStream);
  console.log('📄 Strict PDF/A-3b XMP metadata injected');

  // --- Restore /OutputIntents if existed ---
  if (outputIntents) {
    pdfDoc.catalog.set(PDFName.of('OutputIntents'), outputIntents);
    console.log('🎨 /OutputIntents preserved');
  }

  return await pdfDoc.save({ useObjectStreams: false });
}

module.exports = { postProcessPdfStrict };
