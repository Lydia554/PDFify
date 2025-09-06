const { PDFDocument, PDFName } = require('pdf-lib');
const fs = require('fs');

async function postProcessPdfStrict(pdfBytes, iccPath, xmpPath, zugferdXml = null) {
  console.log("🛠️ Starting postProcessPdfStrict...");

  const pdf = await PDFDocument.load(pdfBytes);
  const catalog = pdf.catalog;
  const ctx = pdf.context;

  console.log("📄 PDF loaded for post-processing, pages:", pdf.getPageCount());

  // --- Metadata (XMP) ---
  let xmpData = fs.readFileSync(xmpPath, 'utf8');
  console.log("📄 XMP template loaded");

  if (zugferdXml) {
    xmpData = xmpData.replace('<!-- ZUGFeRD_PLACEHOLDER -->', zugferdXml);
    console.log("🔗 ZUGFeRD XML embedded into XMP");
  }

  // Ensure PDF/A-3b part B compliance in XMP
  if (!/pdfaid:part>3/i.test(xmpData)) {
    xmpData = xmpData.replace(
      '</rdf:RDF>',
      '<rdf:Description xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id" rdf:about=""><pdfaid:part>3</pdfaid:part></rdf:Description></rdf:RDF>'
    );
    console.log("✅ pdfaid:part=3 added to XMP");
  }

  if (!/pdfaid:conformance>B/i.test(xmpData)) {
    xmpData = xmpData.replace(
      '</rdf:RDF>',
      '<rdf:Description xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id" rdf:about=""><pdfaid:conformance>B</pdfaid:conformance></rdf:Description></rdf:RDF>'
    );
    console.log("✅ pdfaid:conformance=B added to XMP");
  }

  const xmpStream = ctx.flateStream(Buffer.from(xmpData, 'utf8'), {
    Type: PDFName.of('Metadata'),
    Subtype: PDFName.of('XML')
  });
  const xmpRef = ctx.register(xmpStream);
  catalog.set(PDFName.of('Metadata'), xmpRef);

  console.log("✅ XMP metadata registered into PDF");

  const outputBytes = await pdf.save({ useObjectStreams: false });
  console.log("💾 PDF post-processing complete");

  return outputBytes;
}

module.exports = { postProcessPdfStrict };
