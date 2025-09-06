const { PDFDocument, PDFName, PDFString, PDFArray } = require('pdf-lib');
const fs = require('fs');

async function postProcessPdfStrict(pdfBytes, xmpPath = null, zugferdXml = null) {
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // --- XMP metadata injection with proper RDF namespaces ---
  if (xmpPath) {
    let xmpData = fs.readFileSync(xmpPath, 'utf8');

    // Inject PDF/A-3b identifiers if missing
    if (!xmpData.includes('pdfaid:part')) {
      xmpData = xmpData.replace(
        /(<rdf:RDF[^>]*>)/,
        `$1
<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
  <pdfaid:part>3</pdfaid:part>
  <pdfaid:conformance>B</pdfaid:conformance>
</rdf:Description>`
      );
    }

    if (!xmpData.includes('<?xpacket')) {
      xmpData = `<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?>${xmpData}<?xpacket end='w'?>`;
    }

    const xmpStream = pdfDoc.context.register(pdfDoc.context.stream(Buffer.from(xmpData, 'utf8')));
    pdfDoc.catalog.set(PDFName.of('Metadata'), xmpStream);
    console.log('📄 XMP metadata attached with RDF namespaces');
  }

  // --- Attach ZUGFeRD XML ---
  if (zugferdXml) {
    const zugferdStream = pdfDoc.context.register(pdfDoc.context.stream(Buffer.from(zugferdXml, 'utf8')));
    const zugferdFileSpec = pdfDoc.context.register(
      pdfDoc.context.obj({
        Type: PDFName.of('Filespec'),
        F: PDFString.of('zugferd-invoice.xml'),
        EF: pdfDoc.context.obj({ F: zugferdStream }),
        AFRelationship: PDFName.of('Alternative')
      })
    );

    // Merge with existing /AF array if present
    let afArray;
    const existingAF = pdfDoc.catalog.get(PDFName.of('AF'));
    if (existingAF) {
      afArray = pdfDoc.context.lookup(existingAF, PDFArray);
      // Only attach if not already present
      const hasZugferd = afArray.some(ref => {
        const fsObj = pdfDoc.context.lookup(ref);
        const fileName = fsObj.get(PDFName.of('F'));
        return fileName && fileName.value === 'zugferd-invoice.xml';
      });
      if (!hasZugferd) afArray.push(zugferdFileSpec);
    } else {
      afArray = pdfDoc.context.obj([zugferdFileSpec]);
    }

    pdfDoc.catalog.set(PDFName.of('AF'), afArray);
    console.log('📦 ZUGFeRD XML attached with /AFRelationship (no duplicates)');
  }

  const finalBytes = await pdfDoc.save({ useObjectStreams: false });
  return finalBytes;
}

module.exports = { postProcessPdfStrict };
