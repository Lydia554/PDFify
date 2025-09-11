const { PDFDocument, PDFName, PDFString, PDFArray } = require('pdf-lib');
const fs = require('fs');

async function postProcessPdfStrict(pdfBytes, zugferdXml = null, localeMeta = {}, iccPath = null) {
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // --- Setup /OutputIntents ---
  let outputIntents = pdfDoc.catalog.get(PDFName.of('OutputIntents'));
  if (!outputIntents) {
    if (!iccPath) throw new Error('ICC profile path required for PDF/A-3b OutputIntent');

    const iccBytes = fs.readFileSync(iccPath);
    const iccStream = pdfDoc.context.register(pdfDoc.context.stream(iccBytes));

    const intentDict = pdfDoc.context.obj({
      Type: PDFName.of('OutputIntent'),
      S: PDFName.of('GTS_PDFA1'),         // PDF/A-3b standard
      OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
      DestOutputProfile: iccStream,
    });

    pdfDoc.catalog.set(PDFName.of('OutputIntents'), pdfDoc.context.obj([intentDict]));
  }

  // --- Attach ZUGFeRD XML if provided ---
  if (zugferdXml) {
    const zugferdStream = pdfDoc.context.register(pdfDoc.context.stream(Buffer.from(zugferdXml, 'utf8')));
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
      pdfDoc.catalog.set(PDFName.of('AF'), pdfDoc.context.obj([zugferdFileSpec]));
    } else {
      afArray = pdfDoc.context.lookup(afArray, PDFArray);
      afArray.push(zugferdFileSpec);
      pdfDoc.catalog.set(PDFName.of('AF'), afArray);
    }
  }

  // --- Inject PDF/A-3b XMP metadata ---
  const { title = 'Invoice', creator = 'PDFify', language = 'en' } = localeMeta;
  const xmpData = `<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?>
<x:xmpmeta xmlns:x='adobe:ns:meta/' x:xmptk='PDF-Lib'>
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

  const xmpStream = pdfDoc.context.register(pdfDoc.context.stream(Buffer.from(xmpData, 'utf8')));
  pdfDoc.catalog.set(PDFName.of('Metadata'), xmpStream);

  return await pdfDoc.save({ useObjectStreams: false });
}

module.exports = { postProcessPdfStrict };
