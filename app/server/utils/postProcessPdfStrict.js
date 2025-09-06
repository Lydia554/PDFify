const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');

async function postProcessPdfStrict(pdfBytes, iccPath, xmpPath, zugferdXml = null) {
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // 1️⃣ Embed ICC profile
  const iccBytes = fs.readFileSync(iccPath);
  const iccColorSpace = pdfDoc.context.obj({
    Type: 'OutputIntent',
    S: 'GTS_PDFA1',                        // ✅ Correct S entry for PDF/A-3b
    OutputConditionIdentifier: 'sRGB IEC61966-2.1',
    Info: 'sRGB IEC61966-2.1',
    DestOutputProfile: pdfDoc.context.stream(iccBytes),
  });

  // Attach OutputIntent to catalog
  const catalog = pdfDoc.catalog;
  catalog.set('OutputIntents', pdfDoc.context.obj([iccColorSpace]));

  // 2️⃣ Embed XMP metadata
  if (fs.existsSync(xmpPath)) {
    let xmpData = fs.readFileSync(xmpPath, 'utf8');

    // Wrap XMP if needed
    if (!xmpData.includes('<x:xmpmeta')) {
      xmpData = `<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?>\n<x:xmpmeta xmlns:x='adobe:ns:meta/'>\n${xmpData}\n</x:xmpmeta>\n<?xpacket end='w'?>`;
    }

    pdfDoc.setXmpMetadata(xmpData);
  }

  // 3️⃣ Optionally attach ZUGFeRD XML as embedded file
  if (zugferdXml) {
    const fileStream = pdfDoc.context.stream(Buffer.from(zugferdXml, 'utf8'));
    const fileSpec = pdfDoc.context.obj({
      Type: 'Filespec',
      F: 'zugferd.xml',
      EF: { F: fileStream },
    });

    const afArray = pdfDoc.context.obj([fileSpec]);
    pdfDoc.catalog.set('AF', afArray);
  }

  const finalBytes = await pdfDoc.save({ useObjectStreams: false });
  return finalBytes;
}

module.exports = { postProcessPdfStrict };
