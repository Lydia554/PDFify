const { PDFDocument, PDFName, PDFString } = require('pdf-lib');
const fs = require('fs');

async function postProcessPdfStrict(pdfBytes, xmpPath = null, zugferdXml = null) {
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // --- XMP metadata (optional)
  if (xmpPath) {
    let xmpData = fs.readFileSync(xmpPath, 'utf8');

    // Inject PDF/A identification if missing
    if (!xmpData.includes('<pdfaid:part>3</pdfaid:part>')) {
      xmpData = xmpData.replace(
        /(<rdf:Description[^>]*>)/,
        `$1\n<pdfaid:part>3</pdfaid:part>\n<pdfaid:conformance>B</pdfaid:conformance>`
      );
    }

    // Ensure XPacket wrapper
    if (!xmpData.includes('<?xpacket')) {
      xmpData = `<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?>${xmpData}<?xpacket end='w'?>`;
    }

    const xmpStream = pdfDoc.context.register(pdfDoc.context.stream(Buffer.from(xmpData, 'utf8')));
    pdfDoc.catalog.set(PDFName.of('Metadata'), xmpStream);
    console.log('📄 XMP metadata attached');
  }

  // --- Attach ZUGFeRD XML (optional)
  if (zugferdXml) {
    const zugferdStream = pdfDoc.context.register(pdfDoc.context.stream(Buffer.from(zugferdXml, 'utf8')));
    const zugferdFileSpec = pdfDoc.context.register(
      pdfDoc.context.obj({
        Type: PDFName.of('Filespec'),
        F: PDFString.of('zugferd-invoice.xml'),
        EF: pdfDoc.context.obj({ F: zugferdStream })
      })
    );

    // Create AF array (associated files)
    pdfDoc.catalog.set(PDFName.of('AF'), pdfDoc.context.obj([zugferdFileSpec]));
    console.log('📦 ZUGFeRD XML attached');
  }

  // --- Do NOT touch OutputIntent — leave Ghostscript's PDF/A-3b intact
  const finalBytes = await pdfDoc.save({ useObjectStreams: false });
  return finalBytes;
}


module.exports = { postProcessPdfStrict };

