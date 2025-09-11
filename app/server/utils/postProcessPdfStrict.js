// server/utils/postProcessPdfStrict.js
const { PDFDocument, PDFName, PDFString, PDFArray, PDFNumber } = require('pdf-lib');
const fs = require('fs');

// Ensure XMP contains rdf and pdfaid entries (minimal)
function ensureXmpHasPdfa(xmpData) {
  if (!xmpData) {
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

  // If RDF present, inject pdfaid if missing
  if (/<rdf:RDF[\s\S]*<\/rdf:RDF>/.test(xmpData)) {
    if (!/pdfaid:part|<pdfaid:part>/.test(xmpData)) {
      xmpData = xmpData.replace(
        /<\/rdf:RDF>/,
        `\n  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">\n    <pdfaid:part>3</pdfaid:part>\n    <pdfaid:conformance>B</pdfaid:conformance>\n  </rdf:Description>\n</rdf:RDF>`
      );
    }
    return xmpData;
  }

  // Build minimal XMP if no RDF
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

async function addOutputIntentWithIcc(pdfDoc, iccPath) {
  if (!iccPath || !fs.existsSync(iccPath)) {
    console.warn('⚠️ ICC path not provided or not found — skipping /OutputIntents injection.');
    return;
  }

  const context = pdfDoc.context;
  const catalog = pdfDoc.catalog;

  // If OutputIntents present already, don't blindly overwrite; but for our flow we may prefer to replace.
  const existing = catalog.get(PDFName.of('OutputIntents'));
  if (existing) {
    // Already present - leave it alone (Ghostscript may have produced it). If needed, you can replace.
    return;
  }

  // Register ICC bytes as a stream, then add required ICC metadata keys (/N and /Alternate)
  const iccBytes = fs.readFileSync(iccPath);
  const iccStream = context.register(context.stream(iccBytes));

  // set required ICCStream entries
  // /N - number of color components (3 for sRGB)
  // /Alternate - DeviceRGB
  try {
    iccStream.dict.set(PDFName.of('N'), PDFNumber.of(3));
    iccStream.dict.set(PDFName.of('Alternate'), PDFName.of('DeviceRGB'));
  } catch (e) {
    // pdf-lib internals vary; if direct set fails just continue, but this is preferred
    console.warn('⚠️ Failed to set ICC stream dict entries:', e.message || e);
  }

  // Build OutputIntent dictionary, referencing the ICC stream
  const outputIntent = context.obj({
    Type: PDFName.of('OutputIntent'),
    S: PDFName.of('GTS_PDFA1'), // required name
    OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
    Info: PDFString.of('sRGB IEC61966-2.1'),
    DestOutputProfile: iccStream
  });

  const arr = context.obj([outputIntent]);
  catalog.set(PDFName.of('OutputIntents'), arr);
  console.log('✅ Added /OutputIntents with ICC profile (attempted ICCBased stream entries).');
}

async function attachZugferdIfNeeded(pdfDoc, zugferdXml) {
  if (!zugferdXml) return;

  const context = pdfDoc.context;
  const catalog = pdfDoc.catalog;

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
  let af = catalog.get(afKey);

  if (!af) {
    af = context.obj([fileSpec]);
  } else {
    // Resolve existing AF array and avoid duplicates
    const PDFArrayClass = require('pdf-lib').PDFArray;
    af = context.lookup(af, PDFArrayClass);
    const has = af.some(ref => {
      const fsObj = context.lookup(ref);
      const f = fsObj.get(PDFName.of('F'));
      return f && f.value === 'zugferd-invoice.xml';
    });
    if (!has) af.push(fileSpec);
  }

  catalog.set(afKey, af);
  console.log('✅ ZUGFeRD XML attached (AFRelationship=Alternative).');
}

async function setMetadataStream(pdfDoc, xmpData) {
  const context = pdfDoc.context;
  // Use an uncompressed raw stream for XMP (validator expects plain XML)
  const xmpStream = context.register(context.stream(Buffer.from(xmpData, 'utf8')));
  pdfDoc.catalog.set(PDFName.of('Metadata'), xmpStream);
  console.log('✅ XMP metadata attached (raw stream).');
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
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // Prepare XMP
  let xmpData = null;
  if (xmpPath && fs.existsSync(xmpPath)) {
    xmpData = fs.readFileSync(xmpPath, 'utf8');
    xmpData = ensureXmpHasPdfa(xmpData);
  } else {
    xmpData = ensureXmpHasPdfa('');
  }

  // Ensure xpacket wrapper
  if (!xmpData.includes('<?xpacket')) {
    xmpData = `<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?>${xmpData}<?xpacket end='w'?>`;
  }

  // Remove existing Metadata to avoid dangling refs, set new metadata
  try { pdfDoc.catalog.delete(PDFName.of('Metadata')); } catch (e) { /* ignore */ }
  await setMetadataStream(pdfDoc, xmpData);

  // Add OutputIntents if missing (with ICC)
  await addOutputIntentWithIcc(pdfDoc, iccPath);

  // Attach ZUGFeRD if provided
  await attachZugferdIfNeeded(pdfDoc, zugferdXml);

  const finalBytes = await pdfDoc.save({ useObjectStreams: false });
  return finalBytes;
}

module.exports = { postProcessPdfStrict };
