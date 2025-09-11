const fs = require('fs');
const path = require('path');
const { postProcessPdfStrict } = require('../server/utils/postProcessPdfStrict');
const { validatePDFA3bStrict } = require('../tools/pdfa3b-validator');

(async () => {
  try {
    const inputPdfPath = path.resolve(__dirname, 'Gen.pdf');
    if (!fs.existsSync(inputPdfPath)) throw new Error('Input PDF not found');

    const iccPath = path.resolve(__dirname, '../server/routes/sRGB_v4_ICC_preference.icc');
    if (!fs.existsSync(iccPath)) throw new Error('ICC profile not found');

    const pdfBytes = fs.readFileSync(inputPdfPath);

    const finalPdf = await postProcessPdfStrict(pdfBytes, null, { title: 'Test Invoice', creator: 'PDFify', language: 'en' }, iccPath);

    fs.writeFileSync(path.resolve(__dirname, 'Gen_postprocessed.pdf'), finalPdf);
    console.log('✅ PDF post-processed without Ghostscript');

    const result = await validatePDFA3bStrict(finalPdf);
    console.log('📊 Validator result:', JSON.stringify(result, null, 2));

  } catch (err) {
    console.error('❌ Error in post-processing test:', err);
  }
})();
