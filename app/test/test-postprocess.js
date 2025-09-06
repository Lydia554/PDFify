const fs = require('fs');
const path = require('path');
const { postProcessPdfStrict } = require('../server/utils/postProcessPdfStrict');
const { validatePDFA3bStrict } = require('../tools/pdfa3b-validator');
const { execFileSync, execSync } = require('child_process');

(async () => {
  try {
    // 1️⃣ Load original PDF
    const inputPdfPath = path.resolve(__dirname, 'Gen.pdf');
    if (!fs.existsSync(inputPdfPath)) throw new Error('Input PDF not found');
    console.log('📄 Loaded input PDF:', inputPdfPath);

    // 2️⃣ Detect Ghostscript executable robustly
    const possibleGsPaths = [
      'C:\\Program Files\\gs\\gs10.05.1\\bin\\gswin64c.exe',
      'C:\\Program Files (x86)\\gs\\gs10.05.1\\bin\\gswin32c.exe',
      'gswin64c', // fallback if in PATH
      'gswin32c', // fallback if in PATH
      'gs'        // Unix / other OS
    ];

    const gsExe = possibleGsPaths.find(p => {
      if (fs.existsSync(p)) return true; // absolute path exists
      try {
        execSync(`${p} -v`, { stdio: 'ignore' }); // check if executable in PATH
        return true;
      } catch {
        return false;
      }
    });

    if (!gsExe) throw new Error('Ghostscript executable not found. Install Ghostscript or add it to PATH.');
    console.log('🎯 Using Ghostscript executable:', gsExe);

    // 3️⃣ Output path for Ghostscript PDF/A-3b
    const gsOutputPath = path.resolve(__dirname, 'Gen_gs.pdf');

    // 4️⃣ ICC profile path
    const iccPath = path.resolve(__dirname, '../server/routes/sRGB_v4_ICC_preference.icc');
    if (!fs.existsSync(iccPath)) throw new Error('ICC profile not found');

    // 5️⃣ Run Ghostscript
 execFileSync(gsExe, [
  '-dPDFA=3',
  '-dBATCH',
  '-dNOPAUSE',
  '-sDEVICE=pdfwrite',
  '-dEmbedAllFonts=true',
  '-dSubsetFonts=true',
  '-dPreserveDocInfo=true',
  '-dPreserveAnnots=true',
  '-dPDFACompatibilityPolicy=1',
  '-dAutoRotatePages=/None',
  '-sColorConversionStrategy=RGB',
  '-dProcessColorModel=/DeviceRGB',
  '-dConvertCMYKImagesToRGB=true',
  '-dDownsampleColorImages=false',
  '-dDownsampleGrayImages=false',
  '-dDownsampleMonoImages=false',
  '-dPDFSETTINGS=/prepress',
  `-sOutputICCProfile=${iccPath}`,
  `-sOutputFile=${gsOutputPath}`,
  inputPdfPath
], { stdio: 'inherit' });


    console.log('✅ Ghostscript PDF/A-3b generated:', gsOutputPath);

    // 6️⃣ Load Ghostscript PDF/A-3b
    const pdfBytes = fs.readFileSync(gsOutputPath);

    // 7️⃣ Load XMP metadata
    const xmpPath = path.resolve(__dirname, '../server/xmp/zugferd.xmp');

    // 8️⃣ Load optional ZUGFeRD XML
    const zugferdXmlPath = path.resolve(__dirname, 'zugferd.xml');
    const zugferdXml = fs.existsSync(zugferdXmlPath) ? fs.readFileSync(zugferdXmlPath, 'utf8') : null;

    // 9️⃣ Post-process PDF (attach XMP + ZUGFeRD + /OutputIntents)
    const finalPdf = await postProcessPdfStrict(pdfBytes, xmpPath, zugferdXml, iccPath);

    // 🔟 Save processed PDF
    const outputPath = path.resolve(__dirname, 'Gen_postprocessed.pdf');
    fs.writeFileSync(outputPath, finalPdf);
    console.log('✅ PDF post-processed and saved to:', outputPath);

    // 1️⃣1️⃣ Validate PDF/A-3b compliance
    const result = await validatePDFA3bStrict(finalPdf);
    console.log('📊 Validator result:', JSON.stringify(result, null, 2));

  } catch (err) {
    console.error('❌ Error in post-processing test:', err);
  }
})();
