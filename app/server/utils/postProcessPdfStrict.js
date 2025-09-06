const { PDFDocument, PDFName } = require('pdf-lib');
const fs = require('fs');

async function postProcessPdf(pdfBytes, iccPath, xmpPath, zugferdXml = null) {
  const pdf = await PDFDocument.load(pdfBytes);
  const ctx = pdf.context;
  const catalog = pdf.catalog.dict;

  // --- OutputIntent with ICC ---
  const iccBytes = fs.readFileSync(iccPath);
  const iccStream = ctx.flateStream(iccBytes, { N: 3 });
  const iccRef = ctx.register(iccStream);

  const outputIntentDict = ctx.obj({
    Type: PDFName.of('OutputIntent'),
    S: PDFName.of('GTS_PDFA1'),
    OutputConditionIdentifier: 'sRGB IEC61966-2.1',
    DestOutputProfile: iccRef,
    Info: 'sRGB IEC61966-2.1'
  });
  const outputIntentRef = ctx.register(outputIntentDict);

  const oiArray = ctx.obj([outputIntentRef]);
  const oiArrayRef = ctx.register(oiArray);
  catalog.set(PDFName.of('OutputIntents'), oiArrayRef);

  // --- Metadata (XMP) ---
  let xmpData = fs.readFileSync(xmpPath, 'utf8');
  if (zugferdXml) {
    xmpData = xmpData.replace('<!-- ZUGFeRD_PLACEHOLDER -->', zugferdXml);
  }

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

  const xmpStream = ctx.flateStream(Buffer.from(xmpData, 'utf8'), {
    Type: PDFName.of('Metadata'),
    Subtype: PDFName.of('XML')
  });
  const xmpRef = ctx.register(xmpStream);
  catalog.set(PDFName.of('Metadata'), xmpRef);

  return await pdf.save({ useObjectStreams: false });
}

module.exports = { postProcessPdf };
