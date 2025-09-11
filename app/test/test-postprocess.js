const fs = require('fs');
const path = require('path');
const { postProcessPdfStrict } = require('../server/utils/postProcessPdfStrict');

(async () => {
  try {
    const inputPdfPath = path.resolve(__dirname, 'Gen.pdf');
    if (!fs.existsSync(inputPdfPath)) throw new Error('Input PDF not found');

    const pdfBytes = fs.readFileSync(inputPdfPath);

    // --- Only XMP / ZUGFeRD processing (no Ghostscript here) ---
    const finalPdf = await postProcessPdfStrict(pdfBytes, null, { title: 'Test Invoice', creator: 'PDFify', language: 'en' });

    fs.writeFileSync(path.resolve(__dirname, 'Gen_postprocessed.pdf'), finalPdf);
    console.log('✅ PDF post-processed without Ghostscript');

  } catch (err) {
    console.error('❌ Error in post-processing test:', err);
  }
})();
