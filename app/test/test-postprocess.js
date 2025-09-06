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

    // 2️⃣ Detect Ghostscript executable
    const possibleGsPaths = [
      'gs', // Unix / PATH
      'gswin64c', // Windows if in PATH
      'gswin32c', // 32-bit fallback
      'C:\\Program Files\\gs\\gs10.05.1\\bin\\gswin64c.exe', // common Windows path
      'C:\\Program Files (x86)\\gs\\gs10.05.1\\bin\\gswin32c.exe'
    ];

    let gsExe = possibleGsPaths.find(p => fs.existsSync(p) || p === 'gs' || p === 'gswin64c' || p === 'gswin32c');
    if (!gsExe) throw new Error('Ghostscript executable not found. Install Ghostscript.');

    console.log('🎯 Using Ghostscript executable:', gsExe);

    // 3️⃣ Output path for Ghostscript PDF/A-3b
    const gsOutputPath = path.resolve(__dirname, 'Gen_gs.pdf');
    const gsIccPath = path.resolve(__dirname, '../server/routes/sRGB_v4_ICC_preference.icc');
    if (!fs.existsSync(gsIccPath)) throw new Error('ICC profile not found');

    // 4️⃣ Run Ghostscript
    execFileSync(gsExe, [
      '-dPDFA=3', '-dBATCH', '-dNOPAUSE', '-sDEVICE=pdfwrite',
      '-dUseCIEColor=true', '-dEmbedAllFonts=true', '-dSubsetFonts=true',
      '-dPreserveDocInfo=true', '-dPreserveAnnots=true', '-dPDFACompatibilityPolicy=1',
      '-dAutoRotatePages=/None', '-sColorConversionStrategy=RGB', '-dProcessColorModel=/DeviceRGB',
      '-dConvertCMYKImagesToRGB=true', '-dDownsampleColorImages=false', '-dDownsampleGrayImages=false',
      '-dDownsampleMonoImages=false', '-dPDFSETTINGS=/prepress',
      `-sOutputICCProfile=${gsIccPath}`,
      `-sOutputFile=${gsOutputPath}`,
      inputPdfPath
    ], { stdio: 'inherit' });

    console.log('✅ Ghostscript PDF/A-3b generated:', gsOutputPath);

    // 5️⃣ Load Ghostscript PDF/A-3b
    const pdfBytes = fs.readFileSync(gsOutputPath);

    // 6️⃣ Load XMP metadata
    const xmpPath = path.resolve(__dirname, '../server/xmp/zugferd.xmp');

    // 7️⃣ Load optional ZUGFeRD XML
    const zugferdXmlPath = path.resolve(__dirname, 'zugferd.xml');
    const zugferdXml = fs.existsSync(zugferdXmlPath) ? fs.readFileSync(zugferdXmlPath, 'utf8') : null;

    // 8️⃣ Post-process PDF (attach XMP + ZUGFeRD)
    const finalPdf = await postProcessPdfStrict(pdfBytes, xmpPath, zugferdXml);

    // 9️⃣ Save processed PDF
    const outputPath = path.resolve(__dirname, 'Gen_postprocessed.pdf');
    fs.writeFileSync(outputPath, finalPdf);
    console.log('✅ PDF post-processed and saved to:', outputPath);

    // 🔟 Validate PDF/A-3b compliance
    const result = await validatePDFA3bStrict(finalPdf);
    console.log('📊 Validator result:', JSON.stringify(result, null, 2));

  } catch (err) {
    console.error('❌ Error in post-processing test:', err);
  }
})();
