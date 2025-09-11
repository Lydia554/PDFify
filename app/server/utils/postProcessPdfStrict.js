// server/utils/postProcessPdfStrict.js
const { PDFDocument, PDFName, PDFString, PDFArray, PDFNumber } = require('pdf-lib');
const fs = require('fs');

async function postProcessPdfStrict(pdfBytes, zugferdXml = null, localeMeta = {}, iccPath = null) {
  const pdfDoc = await PDFDocument.load(pdfBytes);

  const { title = 'Invoice', creator = 'PDFify', language = 'en' } = localeMeta;

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

  // --- Ensure OutputIntent exists ---
  let outputIntents = pdfDoc.catalog.get(PDFName.of('OutputIntents'));
  if (!outputIntents && iccPath && fs.existsSync(iccPath)) {
    const iccBytes = fs.readFileSync(iccPath);
    const iccStream = pdfDoc.context.register(pdfDoc.context.stream(iccBytes));
    iccStream.dict.set(PDFName.of('N'), PDFNumber.of(3));
    iccStream.dict.set(PDFName.of('Alternate'), PDFName.of('DeviceRGB'));

    const outputIntent = pdfDoc.context.obj({
      Type: PDFName.of('OutputIntent'),
      S: PDFName.of('GTS_PDFA1'),
      OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
      Info: PDFString.of('sRGB IEC61966-2.1'),
      DestOutputProfile: iccStream
    });

    pdfDoc.catalog.set(PDFName.of('OutputIntents'), pdfDoc.context.obj([outputIntent]));
    console.log('🎨 /OutputIntents with ICC injected');
  }

  // --- Inject PDF/A-3b XMP metadata ---
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

  // Remove existing Metadata to avoid dangling references
  try { pdfDoc.catalog.delete(PDFName.of('Metadata')); } catch {}
  const xmpStream = pdfDoc.context.register(pdfDoc.context.stream(Buffer.from(xmpData, 'utf8')));
  pdfDoc.catalog.set(PDFName.of('Metadata'), xmpStream);
  console.log('📄 PDF/A-3b XMP metadata injected');

  return await pdfDoc.save({ useObjectStreams: false });
}

module.exports = { postProcessPdfStrict };
