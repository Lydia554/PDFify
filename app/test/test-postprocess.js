const fs = require('fs');
const path = require('path');
const { postProcessPdfStrict } = require('../server/utils/postProcessPdfStrict');

const { validatePDFA3bStrict } = require('../tools/pdfa3b-validator');

(async () => {
  try {
    const inputPdfPath = path.resolve(__dirname, 'Gen.pdf');
    const pdfBytes = fs.readFileSync(inputPdfPath);
const iccPath = path.resolve(__dirname, "../server/routes/sRGB_IEC61966-2-1.icc");

    const xmpPath = path.resolve(__dirname, '../server/xmp/zugferd.xmp');

    const zugferdXml = fs.existsSync(path.resolve(__dirname, 'zugferd.xml'))
      ? fs.readFileSync(path.resolve(__dirname, 'zugferd.xml'), 'utf8')
      : null;

    const finalPdf = await postProcessPdfStrict(pdfBytes, iccPath, xmpPath, zugferdXml);

    const outputPath = path.resolve(__dirname, 'Gen_postprocessed.pdf');
    fs.writeFileSync(outputPath, finalPdf);
    console.log('✅ PDF post-processed and saved to:', outputPath);

    const result = await validatePDFA3bStrict(finalPdf);
    console.log('📊 Validator result:', JSON.stringify(result, null, 2));

  } catch (err) {
    console.error('❌ Error in post-processing test:', err);
  }
})();
