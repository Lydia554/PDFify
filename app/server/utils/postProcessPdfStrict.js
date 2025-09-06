const { PDFDocument, PDFName, PDFString, PDFArray } = require('pdf-lib');
const fs = require('fs');

async function postProcessPdfStrict(pdfBytes, zugferdXml = null, localeMeta = {}) {
  const pdfDoc = await PDFDocument.load(pdfBytes);

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

  // --- Inject minimal XMP metadata for validator awareness ---
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
  console.log('📄 XMP metadata injected for PDF/A-3b awareness');

  return await pdfDoc.save({ useObjectStreams: false });
}

module.exports = { postProcessPdfStrict };
