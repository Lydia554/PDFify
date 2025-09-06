// server/utils/postProcessPdfStrict.js
const { PDFDocument, PDFName, PDFHexString } = require("pdf-lib");
const fs = require("fs");

async function postProcessPdf(pdfBytes, iccPath, xmpPath, zugferdXml = null) {
  // Load PDF
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const ctx = pdfDoc.context;
  const catalog = pdfDoc.catalog.dict;

  // --- ICC: read file and register as an indirect stream (no assumptions about compression) ---
  if (!fs.existsSync(iccPath)) throw new Error("ICC profile not found: " + iccPath);
  const iccBytes = fs.readFileSync(iccPath);

  // create a (uncompressed) stream if available, else fallback to flateStream
  // pdf-lib: ctx.stream creates a raw stream if supported; use flateStream for compatibility
  let iccStream;
  try {
    // prefer raw stream to keep ICC bytes intact (so validator can find 'acsp')
    if (typeof ctx.stream === "function") {
      iccStream = ctx.stream(iccBytes);
    } else {
      iccStream = ctx.flateStream(iccBytes);
    }
  } catch (e) {
    iccStream = ctx.flateStream(iccBytes);
  }
  const iccRef = ctx.register(iccStream);

  // OutputIntent dictionary
  const outputIntentDict = ctx.obj({
    Type: PDFName.of("OutputIntent"),
    // S must be a PDFName; validator expects 'GTS_PDFA1' (common for PDF/A)
    S: PDFName.of("GTS_PDFA1"),
    // OutputConditionIdentifier and Info are text — use PDFHexString (safe for spaces)
    OutputConditionIdentifier: PDFHexString.of("sRGB IEC61966-2.1"),
    Info: PDFHexString.of("sRGB IEC61966-2.1"),
    DestOutputProfile: iccRef, // indirect reference to the ICC stream
  });
  const outputIntentRef = ctx.register(outputIntentDict);

  // OutputIntents must be an array of dicts
  const oiArray = ctx.obj([outputIntentRef]);
  const oiArrayRef = ctx.register(oiArray);
  catalog.set(PDFName.of("OutputIntents"), oiArrayRef);

  // --- XMP metadata (xpacket wrapper, pdfaid entries) ---
  let xmpRaw = null;
  if (xmpPath && fs.existsSync(xmpPath)) {
    xmpRaw = fs.readFileSync(xmpPath, "utf8").trim();
  }

  // minimal xmp template (valid RDF + xpacket) if no file supplied
  const minimalXmp = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id">
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

  let xmpContent = xmpRaw || minimalXmp;

  // If user provided an xmp file, ensure it has xpacket and pdfaid:part/conformance.
  if (xmpRaw) {
    // Ensure xpacket wrapper
    if (!/^\s*<\?xpacket/i.test(xmpContent)) {
      xmpContent = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n${xmpContent}\n<?xpacket end="w"?>`;
    }

    // Ensure pdfaid definitions exist inside rdf:RDF
    if (!/pdfaid:part\s*>\s*3\s*</i.test(xmpContent)) {
      // insert a small rdf:Description with pdfaid:part=3 before </rdf:RDF>
      xmpContent = xmpContent.replace(
        /<\/rdf:RDF>/i,
        `<rdf:Description xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id" rdf:about=""><pdfaid:part>3</pdfaid:part></rdf:Description>\n</rdf:RDF>`
      );
    }
    if (!/pdfaid:conformance\s*>\s*B\s*</i.test(xmpContent)) {
      xmpContent = xmpContent.replace(
        /<\/rdf:RDF>/i,
        `<rdf:Description xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id" rdf:about=""><pdfaid:conformance>B</pdfaid:conformance></rdf:Description>\n</rdf:RDF>`
      );
    }
  }

  // If user provided zugferdXml and the xmp contains placeholder, insert it (optional)
  if (zugferdXml) {
    // if xmp has placeholder: <!-- ZUGFeRD_PLACEHOLDER --> replace it
    if (xmpContent.includes("<!-- ZUGFeRD_PLACEHOLDER -->")) {
      xmpContent = xmpContent.replace("<!-- ZUGFeRD_PLACEHOLDER -->", zugferdXml);
    } else {
      // otherwise add as a separate rdf:Description under rdf:RDF (safe fallback)
      xmpContent = xmpContent.replace(
        /<\/rdf:RDF>/i,
        `<rdf:Description rdf:about=""><![CDATA[${zugferdXml}]]></rdf:Description>\n</rdf:RDF>`
      );
    }
  }

  // Register XMP metadata stream (use flateStream for compatibility)
  const xmpBuffer = Buffer.from(xmpContent, "utf8");
  let xmpStream;
  try {
    // prefer raw stream if available
    if (typeof ctx.stream === "function") {
      xmpStream = ctx.stream(xmpBuffer, {
        Type: PDFName.of("Metadata"),
        Subtype: PDFName.of("XML"),
      });
    } else {
      xmpStream = ctx.flateStream(xmpBuffer, {
        Type: PDFName.of("Metadata"),
        Subtype: PDFName.of("XML"),
      });
    }
  } catch (e) {
    xmpStream = ctx.flateStream(xmpBuffer, {
      Type: PDFName.of("Metadata"),
      Subtype: PDFName.of("XML"),
    });
  }
  const xmpRef = ctx.register(xmpStream);
  catalog.set(PDFName.of("Metadata"), xmpRef);

  // Save PDF without object streams (safer for validators)
  const outBytes = await pdfDoc.save({ useObjectStreams: false });
  return Buffer.from(outBytes);
}

module.exports = { postProcessPdf };
