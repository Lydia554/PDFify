const { PDFDocument, PDFName, PDFString, PDFArray, PDFDict } = require('pdf-lib');
const fs = require('fs');

async function postProcessPdfStrict(pdfBytes, xmpPath = null, zugferdXml = null, iccPath = null) {
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // --- Remove old /OutputIntents and /Metadata ---
  pdfDoc.catalog.delete(PDFName.of('OutputIntents'));
  pdfDoc.catalog.delete(PDFName.of('Metadata'));
  pdfDoc.catalog.delete(PDFName.of('AF')); // To prevent duplicates for ZUGFeRD

  // --- XMP metadata injection ---
  if (xmpPath && fs.existsSync(xmpPath)) {
    let xmpData = fs.readFileSync(xmpPath, 'utf8');

    // Always ensure part=3 & conformance=B
    xmpData = xmpData.replace(/<\/rdf:RDF>/, `
<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
  <pdfaid:part>3</pdfaid:part>
  <pdfaid:conformance>B</pdfaid:conformance>
</rdf:Description>
</rdf:RDF>`);

    // Add xpacket wrapper if missing
    if (!xmpData.includes('<?xpacket')) {
      xmpData = `<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?>${xmpData}<?xpacket end='w'?>`;
    }

    const xmpStream = pdfDoc.context.register(pdfDoc.context.stream(Buffer.from(xmpData, 'utf8')));
    pdfDoc.catalog.set(PDFName.of('Metadata'), xmpStream);
    console.log('📄 XMP metadata fixed with pdfaid:part=3 & pdfaid:conformance=B');
  }

  // --- /OutputIntents for PDF/A-3b ---
  if (iccPath && fs.existsSync(iccPath)) {
    const iccBytes = fs.readFileSync(iccPath);
    const iccStream = pdfDoc.context.register(pdfDoc.context.stream(iccBytes));

    const outputIntent = pdfDoc.context.obj({
      Type: PDFName.of('OutputIntent'),
      S: PDFName.of('GTS_PDFA1'), // Required value for PDF/A-3b
      OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
      Info: PDFString.of('sRGB IEC61966-2.1'),
      DestOutputProfile: iccStream
    });

    pdfDoc.catalog.set(PDFName.of('OutputIntents'), pdfDoc.context.obj([outputIntent]));
    console.log('🎨 /OutputIntents replaced with GTS_PDFA1');
  }

  // --- Attach ZUGFeRD XML ---
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

    const afArray = pdfDoc.context.obj([zugferdFileSpec]);
    pdfDoc.catalog.set(PDFName.of('AF'), afArray);
    console.log('📦 ZUGFeRD XML attached (duplicates removed)');
  }

  const finalBytes = await pdfDoc.save({ useObjectStreams: false });
  return finalBytes;
}

module.exports = { postProcessPdfStrict };
