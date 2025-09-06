const { PDFDocument, PDFName, PDFHexString } = require('pdf-lib');
const fs = require('fs');

async function postProcessPdfStrict(pdfBytes, iccPath, xmpPath, zugferdXml = null) {
  console.log('🛠️ Starting postProcessPdfStrict...');

  // Load PDF
  const pdf = await PDFDocument.load(pdfBytes);
  const ctx = pdf.context;
  const catalog = pdf.catalog.dict;
  console.log(`📄 PDF loaded for post-processing, pages: ${pdf.getPageCount()}`);

  // --- ICC / OutputIntent ---
  console.log('🎨 Embedding ICC profile...');
  const iccBytes = fs.readFileSync(iccPath);

  // Register ICC profile stream
  const iccStream = ctx.flateStream(iccBytes, { N: 3, Filter: PDFName.of('FlateDecode') });
  const iccRef = ctx.register(iccStream);
  console.log(`📌 ICC stream registered, length: ${iccBytes.length}`);

// Create OutputIntent dictionary for sRGB v4
const outputIntentDict = ctx.obj({
  Type: PDFName.of('OutputIntent'),
  S: PDFName.of('GTS_PDFA1'), // PDF/A-3b requires GTS_PDFA1
  OutputConditionIdentifier: PDFHexString.fromText('sRGB v4 ICC Preference'),
  Info: PDFHexString.fromText('sRGB v4 ICC Preference'),
  DestOutputProfile: iccRef,
  RegistryName: PDFHexString.fromText('http://www.color.org')
});

  const outputIntentRef = ctx.register(outputIntentDict);
  console.log('📌 OutputIntent dictionary registered');

  // Attach OutputIntents array to catalog
  const oiArray = ctx.obj([outputIntentRef]);
  catalog.set(PDFName.of('OutputIntents'), oiArray);
  console.log('✅ ICC OutputIntent attached to catalog');

  // --- Metadata (XMP) ---
  console.log('📄 Loading XMP template...');
  let xmpData = fs.readFileSync(xmpPath, 'utf8');

  if (zugferdXml) {
    xmpData = xmpData.replace('<!-- ZUGFeRD_PLACEHOLDER -->', zugferdXml);
    console.log('📌 ZUGFeRD XML inserted into XMP');
  }

  // Ensure PDF/A-3b part/conformance
  if (!/pdfaid:part>3/i.test(xmpData)) {
    xmpData = xmpData.replace(
      '</rdf:RDF>',
      '<rdf:Description xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id" rdf:about=""><pdfaid:part>3</pdfaid:part></rdf:Description></rdf:RDF>'
    );
    console.log('📌 PDF/A-3 part added to XMP');
  }
  if (!/pdfaid:conformance>B/i.test(xmpData)) {
    xmpData = xmpData.replace(
      '</rdf:RDF>',
      '<rdf:Description xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id" rdf:about=""><pdfaid:conformance>B</pdfaid:conformance></rdf:Description></rdf:RDF>'
    );
    console.log('📌 PDF/A-3 conformance added to XMP');
  }

  // Wrap in XMP packet
  xmpData = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n${xmpData}\n<?xpacket end="w"?>`;
  console.log(`📌 XMP packet length: ${xmpData.length}`);

  // Create XMP metadata stream
  const xmpStream = ctx.flateStream(Buffer.from(xmpData, 'utf8'), {
    Type: PDFName.of('Metadata'),
    Subtype: PDFName.of('XML')
  });
  const xmpRef = ctx.register(xmpStream);
  catalog.set(PDFName.of('Metadata'), xmpRef);
  console.log('✅ XMP metadata registered into PDF');

  // --- Debugging Output ---
  console.log('DEBUG: Raw /OutputIntents =', catalog.get(PDFName.of('OutputIntents')));
  console.log('DEBUG: Raw /Metadata =', catalog.get(PDFName.of('Metadata')));

  // Save PDF
  const finalPdf = await pdf.save({ useObjectStreams: false });
  console.log('💾 PDF post-processing complete, size:', finalPdf.length);

  return finalPdf;
}

module.exports = { postProcessPdfStrict };
