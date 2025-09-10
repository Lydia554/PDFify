const { PDFDocument, PDFName } = require('pdf-lib');

async function postProcessPdfStrict(pdfBytes, zugferdXml = null, localeMeta = {}) {
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // Attach ZUGFeRD if provided
  if (zugferdXml) {
    const xmlStream = pdfDoc.context.register(pdfDoc.context.stream(Buffer.from(zugferdXml, 'utf8')));
    const xmlSpec = pdfDoc.context.obj({
      Type: PDFName.of('Filespec'),
      F: 'zugferd-invoice.xml',
      EF: { F: xmlStream },
      AFRelationship: PDFName.of('Alternative')
    });
    const afArray = pdfDoc.context.obj([xmlSpec]);
    pdfDoc.catalog.set(PDFName.of('AF'), afArray);
  }

  // XMP with PDF/A-3b compliance
  const { title = 'Invoice', creator = 'PDFify', language = 'en' } = localeMeta;
  const xmp = `<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?>
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

  const xmpStream = pdfDoc.context.register(pdfDoc.context.stream(Buffer.from(xmp, 'utf8')));
  pdfDoc.catalog.set(PDFName.of('Metadata'), xmpStream);

  console.log("📄 XMP metadata injected for PDF/A-3b compliance");
  return await pdfDoc.save({ useObjectStreams: false });
}

module.exports = { postProcessPdfStrict };
