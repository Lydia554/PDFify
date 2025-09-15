// utils/postProcessPdfStrict.js
const { PDFDocument, PDFName, PDFString, PDFArray, PDFHexString } = require('pdf-lib');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Replace this with your Graylog logger if you have one
const log = {
  info: (...args) => process.stdout.write(args.join(' ') + '\n'),
  error: (...args) => process.stderr.write(args.join(' ') + '\n')
};

/**
 * Post-process PDF to embed ZUGFeRD XML, PDF/A-3b XMP metadata, and Trailer ID
 * @param {Buffer} pdfBytes - Original PDF bytes
 * @param {string|null} zugferdXml - Optional ZUGFeRD XML content
 * @param {Object} localeMeta - { title, creator, language }
 * @param {string|null} xmpTemplatePath - Optional path to an XMP template
 */
async function postProcessPdfStrict(pdfBytes, zugferdXml = null, localeMeta = {}, xmpTemplatePath = null) {
  let pdfDoc;
  try {
    log.info('📄 Loading PDF into pdf-lib...');
    pdfDoc = await PDFDocument.load(pdfBytes);
  } catch (err) {
    log.error('❌ Failed to load PDF:', err);
    throw err;
  }

  // --- Preserve existing OutputIntents ---
  let outputIntents = null;
  try {
    const existingOutputIntentsRef = pdfDoc.catalog.get(PDFName.of('OutputIntents'));
    if (existingOutputIntentsRef) {
      outputIntents = pdfDoc.context.lookup(existingOutputIntentsRef, PDFArray);
      log.info('🎨 Existing OutputIntents preserved');
    }
  } catch (err) {
    log.error('❌ Error reading OutputIntents:', err);
  }

  // --- Attach ZUGFeRD XML ---
  if (zugferdXml) {
    try {
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
      log.info('📦 ZUGFeRD XML attached');
    } catch (err) {
      log.error('❌ Error attaching ZUGFeRD XML:', err);
      throw err;
    }
  }

  // --- Embed PDF/A-3b XMP metadata ---
  try {
    let xmpContent = '';

    if (xmpTemplatePath && fs.existsSync(xmpTemplatePath)) {
      xmpContent = fs.readFileSync(xmpTemplatePath, 'utf-8');
      log.info('📄 XMP template loaded from', xmpTemplatePath);
    } else {
      // Base XMP
      const { title = 'Invoice', creator = 'PDFify', language = 'en' } = localeMeta;
      xmpContent = `<?xpacket begin='\uFEFF' id='W5M0MpCehiHzreSzNTczkc9d'?>
<x:xmpmeta xmlns:x='adobe:ns:meta/' x:xmptk='PDFify'>
  <rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>
    <rdf:Description rdf:about=''
      xmlns:pdfaid='http://www.aiim.org/pdfa/ns/id/'
      xmlns:dc='http://purl.org/dc/elements/1.1/'>
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
      <dc:title>${title}</dc:title>
      <dc:creator>${creator}</dc:creator>
      <dc:language>${language}</dc:language>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end='w'?>`;
      log.info('📄 Base XMP metadata generated');
    }

    // Ensure UTF-8 BOM
    if (!xmpContent.startsWith('\uFEFF')) xmpContent = '\uFEFF' + xmpContent;

    const metadataStream = pdfDoc.context.flateStream(Buffer.from(xmpContent, 'utf8'), {
      Type: PDFName.of('Metadata'),
      Subtype: PDFName.of('XML')
    });

    pdfDoc.catalog.set(PDFName.of('Metadata'), pdfDoc.context.register(metadataStream));
    log.info('✅ Strict PDF/A-3b XMP metadata embedded');
  } catch (err) {
    log.error('❌ Failed to embed XMP metadata:', err);
    throw err;
  }

  // --- Add Trailer ID ---
  try {
    const id = crypto.randomBytes(16).toString('hex');
    pdfDoc.catalog.set(PDFName.of('ID'), pdfDoc.context.obj([
      PDFHexString.fromText(id),
      PDFHexString.fromText(id)
    ]));
    log.info('🆔 Trailer ID added');
  } catch (err) {
    log.error('❌ Failed to add Trailer ID:', err);
  }

  // --- Restore OutputIntents ---
  try {
    if (outputIntents) {
      pdfDoc.catalog.set(PDFName.of('OutputIntents'), outputIntents);
      log.info('🎨 OutputIntents restored');
    }
  } catch (err) {
    log.error('❌ Failed to restore OutputIntents:', err);
  }

  try {
    const finalPdf = await pdfDoc.save({ useObjectStreams: false });
    log.info('💾 PDF saved successfully');
    return finalPdf;
  } catch (err) {
    log.error('❌ Failed to save PDF:', err);
    throw err;
  }
}

module.exports = { postProcessPdfStrict };
