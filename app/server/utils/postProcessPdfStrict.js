// server/utils/postProcessPdfStrict.js
const { PDFDocument, PDFName, PDFString, PDFArray } = require('pdf-lib');
const fs = require('fs');

/**
 * Ensures XMP data contains PDF/A-3B metadata (pdfaid:part and pdfaid:conformance)
 */
function ensureXmpHasPdfa(xmpData) {
  if (/<rdf:RDF[\s\S]*<\/rdf:RDF>/.test(xmpData)) {
    if (!/pdfaid:part|<pdfaid:part>/.test(xmpData)) {
      xmpData = xmpData.replace(
        /<\/rdf:RDF>/,
        `\n  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">\n    <pdfaid:part>3</pdfaid:part>\n    <pdfaid:conformance>B</pdfaid:conformance>\n  </rdf:Description>\n</rdf:RDF>`
      );
    }
    return xmpData;
  }

  // Minimal XMP if RDF not present
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

/**
 * Add /OutputIntents to PDF if missing
 */
async function addOutputIntentsIfMissing(pdfDoc, iccPath) {
  const catalog = pdfDoc.catalog;
  const context = pdfDoc.context;

  const existing = catalog.get(PDFName.of('OutputIntents'));
  if (existing) return; // Already exists

  if (!iccPath || !fs.existsSync(iccPath)) {
    console.warn('⚠️ ICC path missing, skipping /OutputIntents injection.');
    return;
  }

  const iccBytes = fs.readFileSync(iccPath);
  const iccStream = context.register(context.stream(iccBytes));

  const outputIntent = context.obj({
    Type: PDFName.of('OutputIntent'),
    S: PDFName.of('GTS_PDFA1'),
    OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
    Info: PDFString.of('sRGB IEC61966-2.1'),
    DestOutputProfile: iccStream
  });

  const arr = context.obj([outputIntent]);
  catalog.set(PDFName.of('OutputIntents'), arr);
  console.log('🎨 /OutputIntents added');
}

/**
 * Attach ZUGFeRD XML to PDF (AF array)
 */
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
  let arr;

  if (!af) {
    arr = context.obj([fileSpec]);
  } else {
    arr = context.lookup(af, PDFArray);
    if (!arr) arr = context.obj([fileSpec]);
    else {
      const hasZugferd = arr.some(ref => {
        const fsObj = context.lookup(ref);
        const fname = fsObj.get(PDFName.of('F'));
        return fname && fname.value === 'zugferd-invoice.xml';
      });
      if (!hasZugferd) arr.push(fileSpec);
    }
  }

  pdfDoc.catalog.set(afKey, arr);
  console.log('📦 ZUGFeRD XML attached');
}

/**
 * Set XMP metadata stream
 */
async function setMetadataStream(pdfDoc, xmpData) {
  const context = pdfDoc.context;
  const xmpStream = context.register(context.stream(Buffer.from(xmpData, 'utf8')));
  pdfDoc.catalog.set(PDFName.of('Metadata'), xmpStream);
  console.log('📄 XMP metadata attached');
}

/**
 * Main PDF post-processing function
 */
async function postProcessPdfStrict(pdfBytes, zugferdXml = null, localeMeta = {}, iccPath = null) {
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // --- XMP ---
  let xmpData = '';
  if (localeMeta && localeMeta.title) {
    xmpData = ensureXmpHasPdfa(`<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title>${localeMeta.title}</dc:title>
      <dc:creator>${localeMeta.creator || 'PDFify'}</dc:creator>
      <dc:language>${localeMeta.language || 'en'}</dc:language>
    </rdf:Description>`);
  } else {
    xmpData = ensureXmpHasPdfa('');
  }

  // Ensure xpacket wrapper
  if (!xmpData.includes('<?xpacket')) {
    xmpData = `<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?>${xmpData}<?xpacket end='w'?>`;
  }

  // Remove stale Metadata first
  try { pdfDoc.catalog.delete(PDFName.of('Metadata')); } catch {}

  await setMetadataStream(pdfDoc, xmpData);

  // --- OutputIntents ---
  await addOutputIntentsIfMissing(pdfDoc, iccPath);

  // --- Attach ZUGFeRD ---
  await attachZugferdIfNeeded(pdfDoc, zugferdXml);

  // --- Save ---
  return await pdfDoc.save({ useObjectStreams: false });
}

module.exports = { postProcessPdfStrict };
