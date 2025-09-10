// server/utils/postProcessPdfStrict.js
const { PDFDocument, PDFName, PDFString, PDFArray } = require('pdf-lib');
const fs = require('fs');

function ensureXmpHasPdfa(xmpData) {
  // If there is an RDF block, inject pdfaid description before </rdf:RDF>
  if (/<rdf:RDF[\s\S]*<\/rdf:RDF>/.test(xmpData)) {
    // Only add if pdfaid not present
    if (!/pdfaid:part|<pdfaid:part>/.test(xmpData)) {
      xmpData = xmpData.replace(
        /<\/rdf:RDF>/,
        `\n  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">\n    <pdfaid:part>3</pdfaid:part>\n    <pdfaid:conformance>B</pdfaid:conformance>\n  </rdf:Description>\n</rdf:RDF>`
      );
    }
    return xmpData;
  }

  // No RDF present — build a minimal XMP packet including rdf and pdfaid
  return `<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?>
<x:xmpmeta xmlns:x='adobe:ns:meta/'>
  <rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>
    <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end='w'?>`;
}

async function addOutputIntentsIfMissing(pdfDoc, iccPath) {
  const catalog = pdfDoc.catalog;
  const context = pdfDoc.context;

  const existing = catalog.get(PDFName.of('OutputIntents'));
  if (existing) {
    // Already present — nothing to do
    return;
  }

  if (!iccPath || !fs.existsSync(iccPath)) {
    console.warn('⚠️ ICC path not provided or not found — skipping /OutputIntents injection.');
    return;
  }

  const iccBytes = fs.readFileSync(iccPath);
  const iccStream = context.register(context.stream(iccBytes));

  const outputIntent = context.obj({
    Type: PDFName.of('OutputIntent'),
    S: PDFName.of('GTS_PDFA1'), // required for PDF/A
    OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
    Info: PDFString.of('sRGB IEC61966-2.1'),
    DestOutputProfile: iccStream
  });

  const arr = context.obj([outputIntent]);
  catalog.set(PDFName.of('OutputIntents'), arr);
  console.log('🎨 /OutputIntents added (S=GTS_PDFA1)');
}

async function attachZugferdIfNeeded(pdfDoc, zugferdXml) {
  if (!zugferdXml) return;

  const context = pdfDoc.context;
  const zugStream = context.register(context.stream(Buffer.from(zugferdXml, 'utf8')));
  const fileSpec = context.register(
    context.obj({
      Type: PDFName.of('Filespec'),
      F: PDFString.of('zugferd-invoice.xml'),
      EF: context.obj({ F: zugStream }),
      AFRelationship: PDFName.of('Alternative')
    })
  );

  const afKey = PDFName.of('AF');
  let af = pdfDoc.catalog.get(afKey);

  if (!af) {
    af = context.obj([fileSpec]);
  } else {
    // Resolve existing AF array
    const PDFArrayClass = require('pdf-lib').PDFArray;
    const arr = context.lookup(af, PDFArrayClass);
    // avoid duplicate
    const hasZugferd = arr.some(ref => {
      const fsObj = context.lookup(ref);
      const fname = fsObj.get(PDFName.of('F'));
      return fname && fname.value === 'zugferd-invoice.xml';
    });
    if (!hasZugferd) arr.push(fileSpec);
    af = arr;
  }

  pdfDoc.catalog.set(afKey, af);
  console.log('📦 ZUGFeRD XML attached (AFRelationship=Alternative)');
}

async function setMetadataStream(pdfDoc, xmpData) {
  const context = pdfDoc.context;
  const xmpStream = context.register(context.stream(Buffer.from(xmpData, 'utf8')));
  pdfDoc.catalog.set(PDFName.of('Metadata'), xmpStream);
  console.log('📄 XMP metadata attached');
}

/**
 * Main exported function.
 * @param {Uint8Array|Buffer} pdfBytes - original PDF bytes
 * @param {string|null} xmpPath - path to an XMP template file (optional)
 * @param {string|null} zugferdXml - ZUGFeRD xml string to attach (optional)
 * @param {string|null} iccPath - path to ICC profile to insert to OutputIntents (optional)
 * @returns {Promise<Uint8Array>} processed PDF bytes
 */
async function postProcessPdfStrict(pdfBytes, xmpPath = null, zugferdXml = null, iccPath = null) {
  // Load PDF into pdf-lib
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // --- XMP handling ---
  let xmpData = null;
  if (xmpPath && fs.existsSync(xmpPath)) {
    xmpData = fs.readFileSync(xmpPath, 'utf8');
    xmpData = ensureXmpHasPdfa(xmpData);
  } else {
    // Minimal XMP with pdfaid if no template provided
    xmpData = ensureXmpHasPdfa('');
  }

  // Ensure xpacket wrapper
  if (!xmpData.includes('<?xpacket')) {
    xmpData = `<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?>${xmpData}<?xpacket end='w'?>`;
  }

  // Replace current Metadata (if exists) to avoid stale refs
  try { pdfDoc.catalog.delete(PDFName.of('Metadata')); } catch (e) { /* ignore */ }
  await setMetadataStream(pdfDoc, xmpData);

  // --- OutputIntents: only add if missing (use iccPath) ---
  await addOutputIntentsIfMissing(pdfDoc, iccPath);

  // --- Attach ZUGFeRD xml if provided ---
  await attachZugferdIfNeeded(pdfDoc, zugferdXml);

  // Save final PDF
  const finalBytes = await pdfDoc.save({ useObjectStreams: false });
  return finalBytes;
}

module.exports = { postProcessPdfStrict };
