const { PDFDocument, PDFName, PDFString } = require('pdf-lib');
const fs = require('fs');

async function postProcessPdfStrict(pdfBytes, iccPath, xmpPath, zugferdXml = null) {
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // --- ICC profile
  const iccBytes = fs.readFileSync(iccPath);
  const iccStream = pdfDoc.context.register(pdfDoc.context.stream(iccBytes));

 const outputIntentDict = pdfDoc.context.obj({
  Type: 'OutputIntent', // literal
  S: pdfDoc.context.obj('GTS_PDFA1'), // literal name object
  OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
  Info: PDFString.of('sRGB IEC61966-2.1'),
  DestOutputProfile: iccStream
});

  const outputIntentsArray = pdfDoc.context.register(pdfDoc.context.obj([outputIntentDict]));
  pdfDoc.catalog.set(PDFName.of('OutputIntents'), outputIntentsArray);

  console.log('📌 ICC OutputIntent embedded');

  // --- Debug OutputIntents before save
  const oiRef = pdfDoc.catalog.get(PDFName.of('OutputIntents'));
  const oiObj = pdfDoc.context.lookup(oiRef);
  console.log('🔍 OutputIntents raw:', oiObj.toString());

  // --- XMP metadata
  let xmpData = fs.existsSync(xmpPath) ? fs.readFileSync(xmpPath, 'utf8') : '';

  // ✅ Inject into first <rdf:Description> instead of after </rdf:RDF>
if (!xmpData.includes('<pdfaid:part>3</pdfaid:part>')) {
  xmpData = xmpData.replace(
    /(<rdf:Description[^>]*>)/,
    `$1\n<pdfaid:part>3</pdfaid:part>\n<pdfaid:conformance>B</pdfaid:conformance>`
  );
}


  // Add XPacket wrapper if missing
  if (!xmpData.includes('<?xpacket')) {
    xmpData = `<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?>${xmpData}<?xpacket end='w'?>`;
  }

  const xmpStream = pdfDoc.context.register(pdfDoc.context.stream(Buffer.from(xmpData, 'utf8')));
  pdfDoc.catalog.set(PDFName.of('Metadata'), xmpStream);

  console.log('📄 XMP metadata embedded');

  // --- Debug Metadata before save
  const mdRef = pdfDoc.catalog.get(PDFName.of('Metadata'));
  const mdObj = pdfDoc.context.lookup(mdRef);
  console.log('🔍 Metadata raw:', mdObj.toString());

  // --- ZUGFeRD optional
  if (zugferdXml) {
    const zugferdStream = pdfDoc.context.register(pdfDoc.context.stream(Buffer.from(zugferdXml, 'utf8')));
    const zugferdFileSpec = pdfDoc.context.register(
      pdfDoc.context.obj({
        Type: PDFName.of('Filespec'),
        F: PDFString.of('zugferd.xml'),
        EF: pdfDoc.context.obj({ F: zugferdStream })
      })
    );
    pdfDoc.catalog.set(PDFName.of('AF'), pdfDoc.context.obj([zugferdFileSpec]));
  }

  const finalBytes = await pdfDoc.save({ useObjectStreams: false });
  return finalBytes;
}

module.exports = { postProcessPdfStrict };
