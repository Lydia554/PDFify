const { PDFDocument, PDFName, PDFString, PDFNumber } = require('pdf-lib');
const fs = require('fs');

// Ensure XMP contains rdf and pdfaid entries
function ensureXmpHasPdfa(xmpData) {
  if (!xmpData) {
    return `<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?>
<x:xmpmeta xmlns:x='adobe:ns:meta/'>
  <rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>
    <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end='w'?>`;
  }

  if (/<rdf:RDF[\s\S]*<\/rdf:RDF>/.test(xmpData)) {
    if (!/pdfaid:part|<pdfaid:part>/.test(xmpData)) {
      xmpData = xmpData.replace(
        /<\/rdf:RDF>/,
        `\n  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
    <pdfaid:part>3</pdfaid:part>
    <pdfaid:conformance>B</pdfaid:conformance>
  </rdf:Description>\n</rdf:RDF>`
      );
    }
    return xmpData;
  }

  return `<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?>
<x:xmpmeta xmlns:x='adobe:ns:meta/'>
  <rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>
    <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end='w'?>`;
}

async function addOutputIntentWithIcc(pdfDoc, iccPath) {
  if (!iccPath || !fs.existsSync(iccPath)) return;

  const context = pdfDoc.context;
  const catalog = pdfDoc.catalog;

  const existing = catalog.get(PDFName.of('OutputIntents'));
  if (existing) return;

  const iccBytes = fs.readFileSync(iccPath);
  const iccStream = context.register(context.stream(iccBytes));

  try {
    iccStream.dict.set(PDFName.of('N'), PDFNumber.of(3));
    iccStream.dict.set(PDFName.of('Alternate'), PDFName.of('DeviceRGB'));
  } catch (e) {
    console.warn('⚠️ Failed to set ICC stream dict entries:', e.message || e);
  }

  const outputIntent = context.obj({
    Type: PDFName.of('OutputIntent'),
    S: PDFName.of('GTS_PDFA1'),
    OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
    Info: PDFString.of('sRGB IEC61966-2.1'),
    DestOutputProfile: iccStream
  });

  const arr = context.obj([outputIntent]);
  catalog.set(PDFName.of('OutputIntents'), arr);
  console.log('✅ Added /OutputIntents with ICC profile.');
}

async function attachZugferdIfNeeded(pdfDoc, zugferdXml) {
  if (!zugferdXml) return;

  const context = pdfDoc.context;
  const catalog = pdfDoc.catalog;
  const zugStream = context.register(context.stream(Buffer.from(zugferdXml, 'utf8')));
  const fileSpec = context.register(
    context.obj({
      Type: PDFName.of('Filespec'),
      F: PDFString.of('zugferd-invoice.xml'),
      EF: context.obj({ F: zugStream }),
      AFRelationship: PDFName.of('Alternative')
    })
  );

  let af = catalog.get(PDFName.of('AF'));
  if (!af) af = context.obj([fileSpec]);
  else af.push(fileSpec);

  catalog.set(PDFName.of('AF'), af);
  console.log('✅ ZUGFeRD XML attached.');
}

async function setMetadataStream(pdfDoc, xmpData) {
  const context = pdfDoc.context;
  const xmpStream = context.register(context.stream(Buffer.from(xmpData, 'utf8')));
  pdfDoc.catalog.set(PDFName.of('Metadata'), xmpStream);
  console.log('✅ XMP metadata attached.');
}

async function postProcessPdfStrict(pdfBytes, xmpPath = null, zugferdXml = null, iccPath = null) {
  const pdfDoc = await PDFDocument.load(pdfBytes);

  let xmpData = xmpPath && fs.existsSync(xmpPath)
    ? ensureXmpHasPdfa(fs.readFileSync(xmpPath, 'utf8'))
    : ensureXmpHasPdfa('');

  await setMetadataStream(pdfDoc, xmpData);
  await addOutputIntentWithIcc(pdfDoc, iccPath);
  await attachZugferdIfNeeded(pdfDoc, zugferdXml);

  const finalBytes = await pdfDoc.save({ useObjectStreams: false });
  return finalBytes;
}

module.exports = { postProcessPdfStrict };
