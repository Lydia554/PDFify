const { PDFDocument, PDFName } = require('pdf-lib');
const fs = require('fs');

async function postProcessPdfStrict(pdfBytes, xmpPath, zugferdXml = null) {
  console.log('🛠️ Starting postProcessPdfStrict...');

  // Load PDF
  const pdf = await PDFDocument.load(pdfBytes);
  const ctx = pdf.context;
  const catalog = pdf.catalog.dict;
  console.log(`📄 PDF loaded for post-processing, pages: ${pdf.getPageCount()}`);

  // --- Metadata (XMP) ---
  console.log('📄 Loading XMP template...');
  let xmpData = fs.readFileSync(xmpPath, 'utf8');

  if (zugferdXml) {
    xmpData = xmpData.replace('<!-- ZUGFeRD_PLACEHOLDER -->', zugferdXml);
  }

  // Ensure PDF/A-3b part/conformance is present
  if (!/pdfaid:part>3/i.test(xmpData)) {
    xmpData = xmpData.replace(
      '</rdf:RDF>',
      '<rdf:Description xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id" rdf:about=""><pdfaid:part>3</pdfaid:part></rdf:Description></rdf:RDF>'
    );
  }
  if (!/pdfaid:conformance>B/i.test(xmpData)) {
    xmpData = xmpData.replace(
      '</rdf:RDF>',
      '<rdf:Description xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id" rdf:about=""><pdfaid:conformance>B</pdfaid:conformance></rdf:Description></rdf:RDF>'
    );
  }

  // Wrap in XMP packet
  xmpData = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n${xmpData}\n<?xpacket end="w"?>`;

  const xmpStream = ctx.flateStream(Buffer.from(xmpData, 'utf8'), {
    Type: PDFName.of('Metadata'),
    Subtype: PDFName.of('XML'),
  });
  const xmpRef = ctx.register(xmpStream);
  catalog.set(PDFName.of('Metadata'), xmpRef);
  console.log('✅ XMP metadata registered into PDF');

  console.log('💾 PDF post-processing complete');
  return await pdf.save({ useObjectStreams: false });
}

module.exports = { postProcessPdfStrict };
