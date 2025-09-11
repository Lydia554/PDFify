const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { postProcessPdfStrict } = require('../server/utils/postProcessPdfStrict');
const { validatePDFA3bStrict } = require('../tools/pdfa3b-validator');

(async () => {
  try {
    // Load original PDF
    const inputPdfPath = path.resolve(__dirname, 'Gen.pdf');
    if (!fs.existsSync(inputPdfPath)) throw new Error('Input PDF not found');
    console.log('📄 Loaded input PDF:', inputPdfPath);

    // Detect Ghostscript
    const possibleGsPaths = [
      'C:\\Program Files\\gs\\gs10.05.1\\bin\\gswin64c.exe',
      'C:\\Program Files (x86)\\gs\\gs10.05.1\\bin\\gswin32c.exe',
      'gswin64c', 'gswin32c', 'gs'
    ];
    const gsExe = possibleGsPaths.find(p => {
      if (fs.existsSync(p)) return true;
      try { require('child_process').execSync(`${p} -v`, { stdio: 'ignore' }); return true; } catch { return false; }
    });
    if (!gsExe) throw new Error('Ghostscript not found.');
    console.log('🎯 Using Ghostscript executable:', gsExe);

    // ICC and output paths
    const iccPath = path.resolve(__dirname, '../server/routes/sRGB_v4_ICC_preference.icc');
    if (!fs.existsSync(iccPath)) throw new Error('ICC profile not found');

    const gsOutputPath = path.resolve(__dirname, 'Gen_gs.pdf');
    const finalOutputPath = path.resolve(__dirname, 'Gen_postprocessed.pdf');

    // Convert to PDF/A-3b using Ghostscript
    execFileSync(gsExe, [
      '-dPDFA=3', '-dBATCH', '-dNOPAUSE', '-sDEVICE=pdfwrite',
      '-dEmbedAllFonts=true', '-dSubsetFonts=true',
      '-dPreserveDocInfo=true', '-dPreserveAnnots=true', '-dPDFACompatibilityPolicy=1',
      '-dAutoRotatePages=/None', '-sColorConversionStrategy=RGB', '-dProcessColorModel=/DeviceRGB',
      '-dConvertCMYKImagesToRGB=true', '-dDownsampleColorImages=false', '-dDownsampleGrayImages=false',
      '-dDownsampleMonoImages=false', '-dPDFSETTINGS=/prepress',
      `-sOutputFile=${gsOutputPath}`, // MUST be before input PDF
      inputPdfPath
    ], { stdio: 'inherit' });

    console.log('✅ Ghostscript PDF/A-3b generated:', gsOutputPath);

    // Load PDF bytes
    const pdfBytes = fs.readFileSync(gsOutputPath);

    // Optional ZUGFeRD XML
    const zugferdXmlPath = path.resolve(__dirname, 'zugferd.xml');
    const zugferdXml = fs.existsSync(zugferdXmlPath) ? fs.readFileSync(zugferdXmlPath, 'utf8') : null;

    // Metadata for XMP
    const localeMeta = { title: 'Invoice', creator: 'PDFify', language: 'en' };

    // Post-process PDF (ICC, XMP, ZUGFeRD)
    const finalPdf = await postProcessPdfStrict(pdfBytes, null, zugferdXml, iccPath);

    // Save final PDF
    fs.writeFileSync(finalOutputPath, finalPdf);
    console.log('✅ PDF post-processed and saved to:', finalOutputPath);

    // Validate PDF/A-3b
    const result = await validatePDFA3bStrict(finalPdf);
    console.log('📊 Validator result:', JSON.stringify(result, null, 2));

  } catch (err) {
    console.error('❌ Error in post-processing test:', err);
  }
})();
