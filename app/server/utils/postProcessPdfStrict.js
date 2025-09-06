const { PDFDocument, PDFName } = require('pdf-lib');
const fs = require('fs');

async function postProcessPdfStrict(pdfBytes, iccPath, xmpPath, zugferdXml = null) {
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // 1️⃣ Embed ICC profile as OutputIntent (PDF/A-3b compliant)
  const iccBytes = fs.readFileSync(iccPath);
  const iccStream = pdfDoc.context.stream(iccBytes);

  const outputIntent = pdfDoc.context.obj({
    Type: PDFName.of('OutputIntent'),
    S: PDFName.of('GTS_PDFA1'), // ✅ Proper PDFName for PDF/A-3b
    OutputConditionIdentifier: pdfDoc.context.str('sRGB IEC61966-2.1'),
    Info: pdfDoc.context.str('sRGB IEC61966-2.1'),
    DestOutputProfile: iccStream,
  });

  pdfDoc.catalog.set(
    PDFName.of('OutputIntents'),
    pdfDoc.context.obj([outputIntent])
  );

  console.log('📌 ICC OutputIntent embedded correctly');

  // 2️⃣ Embed XMP metadata with PDF/A-3b info
  let xmpData = fs.existsSync(xmpPath) ? fs.readFileSync(xmpPath, 'utf8') : '';
  
  // Wrap XMP if missing root
  if (!xmpData.includes('<x:xmpmeta')) {
    xmpData = `<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?>
<x:xmpmeta xmlns:x='adobe:ns:meta/'>
  <rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>
    <rdf:Description rdf:about=''
      xmlns:pdfaid='http://www.aiim.org/pdfa/ns/id/'>
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end='w'?>`;
  }

  const xmpStream = pdfDoc.context.stream(Buffer.from(xmpData, 'utf8'));
  const metadataRef = pdfDoc.context.register(xmpStream);
  pdfDoc.catalog.set(PDFName.of('Metadata'), metadataRef);

  console.log('📄 XMP metadata embedded with PDF/A-3b info');

  // 3️⃣ Optionally embed ZUGFeRD XML
  if (zugferdXml) {
    const zugferdStream = pdfDoc.context.stream(Buffer.from(zugferdXml, 'utf8'));
    const zugferdFileSpec = pdfDoc.context.obj({
      Type: PDFName.of('Filespec'),
      F: pdfDoc.context.str('zugferd.xml'),
      EF: { F: zugferdStream },
    });
    const afArray = pdfDoc.context.obj([zugferdFileSpec]);
    pdfDoc.catalog.set(PDFName.of('AF'), afArray);
    console.log('📎 ZUGFeRD XML attached');
  }

  const finalBytes = await pdfDoc.save({ useObjectStreams: false });
  console.log('✅ PDF post-processed');

  return finalBytes;
}

module.exports = { postProcessPdfStrict };
