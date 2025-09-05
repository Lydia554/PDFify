const { PDFDocument, PDFName } = require('pdf-lib');
const fs = require('fs');

async function postProcessPdf(pdfBytes, iccPath, xmpPath, zugferdXml = null) {
  const pdf = await PDFDocument.load(pdfBytes);
  const ctx = pdf.context;
  const catalog = pdf.catalog.dict;

  // --- OutputIntent with ICC ---
  const iccBytes = fs.readFileSync(iccPath);
  const iccStream = ctx.flateStream(iccBytes, { Type: PDFName.of('Stream'), N: 3 });
  const outputIntentDict = ctx.obj({
    Type: PDFName.of('OutputIntent'),
    S: PDFName.of('GTS_PDFA1'),
    OutputConditionIdentifier: 'sRGB IEC61966-2.1',
    DestOutputProfile: iccStream,
    Info: 'sRGB IEC61966-2.1'
  });
  const oiArray = ctx.obj([outputIntentDict]);
  catalog.set(PDFName.of('OutputIntents'), oiArray);

  // --- Metadata (XMP) ---
  let xmpData = fs.readFileSync(xmpPath, 'utf8');
  if (zugferdXml) xmpData = xmpData.replace('<!-- ZUGFeRD_PLACEHOLDER -->', zugferdXml);

  // Inject PDF/A-3b tags if missing
  if (!/pdfaid:part=3/i.test(xmpData)) xmpData = xmpData.replace('</rdf:RDF>', '<pdfaid:part>3</pdfaid:part></rdf:RDF>');
  if (!/pdfaid:conformance=B/i.test(xmpData)) xmpData = xmpData.replace('</rdf:RDF>', '<pdfaid:conformance>B</pdfaid:conformance></rdf:RDF>');

  const xmpStream = ctx.flateStream(Buffer.from(xmpData, 'utf8'), {
    Type: PDFName.of('Metadata'),
    Subtype: PDFName.of('XML')
  });
  catalog.set(PDFName.of('Metadata'), xmpStream);

  return await pdf.save({ useObjectStreams: false });
}

module.exports = { postProcessPdf };
