const { PDFDocument, PDFName } = require('pdf-lib');
const fs = require('fs');

async function postProcessPdf(pdfBytes, iccPath, xmpPath, zugferdXml = null) {
  const pdf = await PDFDocument.load(pdfBytes);
  const ctx = pdf.context;
  const catalog = pdf.catalog.dict;

  // --- OutputIntents with ICC ---
  const iccBytes = fs.readFileSync(iccPath);
  const iccStream = ctx.flateStream(iccBytes, { N: 3 });
  const outputIntentDict = ctx.obj({
    Type: PDFName.of('OutputIntent'),
    S: PDFName.of('GTS_PDFA1'),
    OutputConditionIdentifier: 'sRGB IEC61966-2.1',
    DestOutputProfile: iccStream,
    Info: 'sRGB IEC61966-2.1'
  });

  // Ensure it's a proper indirect object array
  const oiDictRef = ctx.register(outputIntentDict);
  const oiArray = ctx.obj([oiDictRef]);
  catalog.set(PDFName.of('OutputIntents'), oiArray);

  // --- Metadata (XMP) ---
  let xmpData = fs.readFileSync(xmpPath, 'utf8');
  if (zugferdXml) {
    xmpData = xmpData.replace('<!-- ZUGFeRD_PLACEHOLDER -->', zugferdXml);
  }

  // Inject PDF/A-3b tags properly inside rdf:Description
  if (!/pdfaid:part>3</i.test(xmpData)) {
    xmpData = xmpData.replace(
      '</rdf:RDF>',
      '<rdf:Description xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id" rdf:about=""><pdfaid:part>3</pdfaid:part></rdf:Description></rdf:RDF>'
    );
  }
  if (!/pdfaid:conformance>B</i.test(xmpData)) {
    xmpData = xmpData.replace(
      '</rdf:RDF>',
      '<rdf:Description xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id" rdf:about=""><pdfaid:conformance>B</pdfaid:conformance></rdf:Description></rdf:RDF>'
    );
  }

  // Add as proper Metadata stream
  const xmpStream = ctx.flateStream(Buffer.from(xmpData, 'utf8'), {
    Type: PDFName.of('Metadata'),
    Subtype: PDFName.of('XML')
  });
  const xmpRef = ctx.register(xmpStream);
  catalog.set(PDFName.of('Metadata'), xmpRef);

  // Save with object streams disabled (important for PDF/A)
  return await pdf.save({ useObjectStreams: false });
}

module.exports = { postProcessPdf };
