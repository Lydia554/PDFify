const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

async function postProcessPdfStrict(pdfBytes, iccPath, xmpPath, zugferdXml = null) {
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // 1️⃣ Embed ICC profile as OutputIntent
  const iccBytes = fs.readFileSync(iccPath);
  const iccStream = pdfDoc.context.stream(iccBytes);

  const outputIntent = pdfDoc.context.obj({
    Type: pdfDoc.context.name('OutputIntent'),
    S: pdfDoc.context.name('GTS_PDFA1'),                      // ✅ PDF/A-3b
    OutputConditionIdentifier: pdfDoc.context.obj('sRGB IEC61966-2.1'),
    Info: pdfDoc.context.obj('sRGB IEC61966-2.1'),
    DestOutputProfile: iccStream,
  });

  pdfDoc.catalog.set(
    pdfDoc.context.name('OutputIntents'),
    pdfDoc.context.obj([outputIntent])
  );

  console.log('📌 ICC OutputIntent embedded');

  // 2️⃣ Embed XMP metadata (PDF/A-3b required tags)
  let xmpData = '';
  if (fs.existsSync(xmpPath)) {
    xmpData = fs.readFileSync(xmpPath, 'utf8');
  }

  // Wrap in xpacket and ensure pdfaid:part=3, conformance=B
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
  pdfDoc.catalog.set(pdfDoc.context.name('Metadata'), metadataRef);

  console.log('📄 XMP metadata embedded, length:', xmpData.length);

  // 3️⃣ Optional ZUGFeRD XML attachment
  if (zugferdXml) {
    const zugferdStream = pdfDoc.context.stream(Buffer.from(zugferdXml, 'utf8'));
    const zugferdFileSpec = pdfDoc.context.obj({
      Type: pdfDoc.context.name('Filespec'),
      F: pdfDoc.context.obj('zugferd.xml'),
      EF: { F: zugferdStream },
    });

    const afArray = pdfDoc.context.obj([zugferdFileSpec]);
    pdfDoc.catalog.set(pdfDoc.context.name('AF'), afArray);

    console.log('📎 ZUGFeRD XML attached, length:', zugferdXml.length);
  }

  const finalBytes = await pdfDoc.save({ useObjectStreams: false });

  console.log('✅ PDF post-processed and saved');

  return finalBytes;
}

module.exports = { postProcessPdfStrict };
