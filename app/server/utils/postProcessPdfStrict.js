const { PDFDocument, PDFName, PDFHexString } = require('pdf-lib');
const fs = require('fs');

async function postProcessPdfStrict(pdfBytes, iccPath, xmpPath, zugferdXml = null) {
  const pdfDoc = await PDFDocument.load(pdfBytes);

  const iccBytes = fs.readFileSync(iccPath);
  const iccStream = pdfDoc.context.stream(iccBytes);

  const outputIntent = pdfDoc.context.obj({
    Type: PDFName.of('OutputIntent'),
    S: PDFName.of('GTS_PDFA1'),                    // ✅ PDF/A-3b requires this
    OutputConditionIdentifier: PDFHexString.fromText('sRGB IEC61966-2.1'), 
    Info: PDFHexString.fromText('sRGB IEC61966-2.1'),
    DestOutputProfile: iccStream,
  });

  pdfDoc.catalog.set(
    PDFName.of('OutputIntents'),
    pdfDoc.context.obj([outputIntent])
  );

  // XMP metadata
  let xmpData = fs.existsSync(xmpPath) ? fs.readFileSync(xmpPath, 'utf8') : '';
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

  const finalBytes = await pdfDoc.save({ useObjectStreams: false });
  return finalBytes;
}

module.exports = { postProcessPdfStrict };
