const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

async function postProcessPdfStrict(pdfBytes, iccPath, xmpPath, zugferdXml = null) {
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // 1️⃣ Embed ICC profile as OutputIntent

  const iccBytes = fs.readFileSync(iccPath);
  const iccOutputIntent = pdfDoc.context.obj({
    Type: PDFName.of('OutputIntent'),
    S: PDFName.of('GTS_PDFA1'),                     // Correct /S for PDF/A-3b
    OutputConditionIdentifier: pdfDoc.context.str('sRGB IEC61966-2.1'),
    Info: pdfDoc.context.str('sRGB IEC61966-2.1'),
    DestOutputProfile: pdfDoc.context.stream(iccBytes),
  });

  pdfDoc.catalog.set(
    PDFName.of('OutputIntents'),
    pdfDoc.context.obj([iccOutputIntent])
  );

  console.log('📌 ICC OutputIntent dictionary registered:');
  console.log({
    Type: 'OutputIntent',
    S: 'GTS_PDFA1',
    OutputConditionIdentifier: 'sRGB IEC61966-2.1',
    DestOutputProfileLength: iccBytes.length,
  });

  // 2️⃣ Embed XMP metadata
  if (fs.existsSync(xmpPath)) {
    let xmpData = fs.readFileSync(xmpPath, 'utf8');

    // Wrap in xpacket if missing
    if (!xmpData.includes('<x:xmpmeta')) {
      xmpData = `<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?>
<x:xmpmeta xmlns:x='adobe:ns:meta/'>
${xmpData}
</x:xmpmeta>
<?xpacket end='w'?>`;
    }

    const xmpStream = pdfDoc.context.stream(Buffer.from(xmpData, 'utf8'));
    const metadataRef = pdfDoc.context.register(xmpStream);
    pdfDoc.catalog.set('Metadata', metadataRef);

    console.log('📄 XMP metadata registered, length:', xmpData.length);
  }

  // 3️⃣ Optionally embed ZUGFeRD XML as a file attachment
  if (zugferdXml) {
    const zugferdStream = pdfDoc.context.stream(Buffer.from(zugferdXml, 'utf8'));
    const zugferdFileSpec = pdfDoc.context.obj({
      Type: pdfDoc.context.name('Filespec'),
      F: pdfDoc.context.str('zugferd.xml'),
      EF: { F: zugferdStream },
    });

    const afArray = pdfDoc.context.obj([zugferdFileSpec]);
    pdfDoc.catalog.set('AF', afArray);

    console.log('📎 ZUGFeRD XML attached, length:', zugferdXml.length);
  }

  const finalBytes = await pdfDoc.save({ useObjectStreams: false });

  // Log catalog OutputIntents after save
  const catalog = pdfDoc.catalog.lookupMaybe('OutputIntents');
  console.log('🔹 Catalog /OutputIntents after embedding:', catalog ? catalog.toString() : 'None');

  return finalBytes;
}

module.exports = { postProcessPdfStrict };
