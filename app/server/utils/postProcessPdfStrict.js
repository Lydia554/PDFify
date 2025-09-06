const { PDFDocument, PDFName, PDFString, PDFArray } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function postProcessPdfStrict(pdfBytes, xmpPath = null, zugferdXml = null, iccPath = null) {
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // --- XMP metadata injection ---
  if (xmpPath && fs.existsSync(xmpPath)) {
    let xmpData = fs.readFileSync(xmpPath, 'utf8');

    // Add PDF/A-3b identifiers if missing
    if (!xmpData.includes('<pdfaid:part>3</pdfaid:part>')) {
      xmpData = xmpData.replace(
        /(<rdf:RDF[^>]*>)/,
        `$1
<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
  <pdfaid:part>3</pdfaid:part>
  <pdfaid:conformance>B</pdfaid:conformance>
</rdf:Description>`
      );
    }

    // Ensure xpacket wrapper
    if (!xmpData.includes('<?xpacket')) {
      xmpData = `<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?>${xmpData}<?xpacket end='w'?>`;
    }

    const xmpStream = pdfDoc.context.register(pdfDoc.context.stream(Buffer.from(xmpData, 'utf8')));
    pdfDoc.catalog.set(PDFName.of('Metadata'), xmpStream);
    console.log('📄 XMP metadata injected with pdfaid:part=3 and pdfaid:conformance=B');
  }

  // --- /OutputIntents for PDF/A-3b ---
  if (iccPath && fs.existsSync(iccPath)) {
    const iccBytes = fs.readFileSync(iccPath);
    const iccStream = pdfDoc.context.register(pdfDoc.context.stream(iccBytes));

    const outputIntent = pdfDoc.context.obj({
      Type: PDFName.of('OutputIntent'),
      S: PDFName.of('GTS_PDFA1'), // Required for PDF/A
      OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
      Info: PDFString.of('sRGB IEC61966-2.1'),
      DestOutputProfile: iccStream
    });

    pdfDoc.catalog.set(PDFName.of('OutputIntents'), pdfDoc.context.obj([outputIntent]));
    console.log('🎨 /OutputIntents set with S=GTS_PDFA1');
  } else {
    console.warn('⚠️ ICC profile missing: skipping /OutputIntents');
  }

  // --- Attach ZUGFeRD XML (no duplicates) ---
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

    let afArray;
    const existingAF = pdfDoc.catalog.get(PDFName.of('AF'));
    if (existingAF) {
      afArray = pdfDoc.context.lookup(existingAF, PDFArray);
      const hasZugferd = afArray.some(ref => {
        const fsObj = pdfDoc.context.lookup(ref);
        const fileName = fsObj.get(PDFName.of('F'));
        return fileName && fileName.value === 'zugferd-invoice.xml';
      });
      if (!hasZugferd) afArray.push(zugferdFileSpec);
    } else {
      afArray = pdfDoc.context.obj([zugferdFileSpec]);
    }

    pdfDoc.catalog.set(PDFName.of('AF'), afArray);
    console.log('📦 ZUGFeRD XML embedded with AFRelationship=Alternative');
  }

  const finalBytes = await pdfDoc.save({ useObjectStreams: false });
  return finalBytes;
}

module.exports = { postProcessPdfStrict };
