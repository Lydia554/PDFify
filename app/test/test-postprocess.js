const fs = require('fs');
const path = require('path');
const { postProcessPdfStrict } = require('../server/utils/postProcessPdfStrict');
const { validatePDFA3bStrict } = require('../tools/pdfa3b-validator');
const { execFileSync } = require('child_process');

(async () => {
  try {
    // 1️⃣ Load original PDF
    const inputPdfPath = path.resolve(__dirname, 'Gen.pdf');
    if (!fs.existsSync(inputPdfPath)) throw new Error('Input PDF not found');
    console.log('📄 Loaded input PDF:', inputPdfPath);

    // 2️⃣ Run Ghostscript to create PDF/A-3b
    const gsIccPath = path.resolve(__dirname, '../server/routes/sRGB_v4_ICC_preference.icc');
    if (!fs.existsSync(gsIccPath)) throw new Error('ICC profile not found');

    const gsOutputPath = path.resolve(__dirname, 'Gen_gs.pdf');
    execFileSync('gs', [
      '-dPDFA=3', '-dBATCH', '-dNOPAUSE', '-sDEVICE=pdfwrite',
      '-dUseCIEColor=true', '-dEmbedAllFonts=true', '-dSubsetFonts=true',
      '-dPreserveDocInfo=true', '-dPreserveAnnots=true', '-dPDFACompatibilityPolicy=1',
      '-dAutoRotatePages=/None', '-sColorConversionStrategy=RGB', '-dProcessColorModel=/DeviceRGB',
      '-dConvertCMYKImagesToRGB=true', '-dDownsampleColorImages=false', '-dDownsampleGrayImages=false',
      '-dDownsampleMonoImages=false', '-dPDFSETTINGS=/prepress',
      `-sOutputICCProfile=${gsIccPath}`, `-sOutputFile=${gsOutputPath}`, inputPdfPath
    ], { stdio: 'inherit' });

    console.log('✅ Ghostscript PDF/A-3b generated:', gsOutputPath);

    // 3️⃣ Load Ghostscript PDF/A-3b
    const pdfBytes = fs.readFileSync(gsOutputPath);

    // 4️⃣ Load XMP metadata
    const xmpPath = path.resolve(__dirname, '../server/xmp/zugferd.xmp');

    // 5️⃣ Load optional ZUGFeRD XML
    const zugferdXmlPath = path.resolve(__dirname, 'zugferd.xml');
    const zugferdXml = fs.existsSync(zugferdXmlPath) ? fs.readFileSync(zugferdXmlPath, 'utf8') : null;

    // 6️⃣ Post-process PDF (attach XMP + ZUGFeRD)
    const finalPdf = await postProcessPdfStrict(pdfBytes, xmpPath, zugferdXml);

    // 7️⃣ Save processed PDF
    const outputPath = path.resolve(__dirname, 'Gen_postprocessed.pdf');
    fs.writeFileSync(outputPath, finalPdf);
    console.log('✅ PDF post-processed and saved to:', outputPath);

    // 8️⃣ Validate PDF/A-3b compliance
    const result = await validatePDFA3bStrict(finalPdf);
    console.log('📊 Validator result:', JSON.stringify(result, null, 2));

  } catch (err) {
    console.error('❌ Error in post-processing test:', err);
  }
})();
