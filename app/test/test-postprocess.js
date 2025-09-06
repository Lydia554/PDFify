// test/test-postprocess.js
const fs = require('fs');
const path = require('path');
const { postProcessPdf } = require('../server/utils/postProcessPdfStrict');
const { validatePDFA3bStrict } = require('../tools/pdfa3b-validator-strict');

(async () => {
  try {
    const inputPdfPath = path.resolve(__dirname, 'Gen.pdf'); // your input file
    const pdfBytes = fs.readFileSync(inputPdfPath);

    // adjust these to point to your files (paths relative to project root)
    const iccPath = path.resolve(__dirname, '../sRGB_IEC61966-2-1_no_black_scaling.icc');
    const xmpPath = path.resolve(__dirname, '../server/xmp/zugferd.xmp'); // or null

    // optional zugferd xml next to Gen.pdf for test:
    const zugferdXml = fs.existsSync(path.resolve(__dirname, 'zugferd.xml'))
      ? fs.readFileSync(path.resolve(__dirname, 'zugferd.xml'), 'utf8')
      : null;

    const finalPdf = await postProcessPdf(pdfBytes, iccPath, xmpPath, zugferdXml);
    const out = path.resolve(__dirname, 'Gen_postprocessed.pdf');
    fs.writeFileSync(out, finalPdf);
    console.log('✅ PDF post-processed and saved to:', out);

    const result = await validatePDFA3bStrict(finalPdf);
    console.log('📊 Validator result:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('❌ Error in post-processing test:', err);
  }
})();
