const fs = require('fs');
const path = require('path');
const { postProcessPdfStrict } = require('../server/utils/postProcessPdfStrict');
const { validatePDFA3bStrict } = require('../tools/pdfa3b-validator');
const { execFile } = require('child_process');

(async () => {
  try {
    const inputPdfPath = path.resolve(__dirname, 'Gen.pdf');
    if (!fs.existsSync(inputPdfPath)) throw new Error('Input PDF not found');

    const iccPath = path.resolve(__dirname, '../server/routes/sRGB_v4_ICC_preference.icc');
    if (!fs.existsSync(iccPath)) throw new Error('ICC profile not found');

    // Convert PDF to strict PDF/A-3b with Ghostscript first
    const tmpPdfAPath = path.resolve(__dirname, 'Gen_pdfa.pdf');
    await new Promise((resolve, reject) => {
      const gsArgs = [
        "-dPDFA=3", "-dBATCH", "-dNOPAUSE", "-dNOOUTERSAVE", "-sDEVICE=pdfwrite",
        "-dEmbedAllFonts=true", "-dSubsetFonts=true", "-dPreserveDocInfo=true",
        "-dPDFACompatibilityPolicy=1",
        "-dAutoRotatePages=/None", "-sColorConversionStrategy=RGB", "-dProcessColorModel=/DeviceRGB",
        `-sOutputICCProfile=${iccPath}`,
        `-sOutputFile=${tmpPdfAPath}`,
        inputPdfPath
      ];
      execFile('gswin64c', gsArgs, err => err ? reject(err) : resolve());
    });

    let pdfBytes = fs.readFileSync(tmpPdfAPath);

    // Post-process for XMP/ZUGFeRD
    const finalPdf = await postProcessPdfStrict(pdfBytes, null, { title: 'Test Invoice', creator: 'PDFify', language: 'en' });

    fs.writeFileSync(path.resolve(__dirname, 'Gen_postprocessed.pdf'), finalPdf);
    console.log('✅ PDF post-processed with Ghostscript + pdf-lib');

    const result = await validatePDFA3bStrict(finalPdf);
    console.log('📊 Validator result:', JSON.stringify(result, null, 2));

  } catch (err) {
    console.error('❌ Error in post-processing test:', err);
  }
})();
