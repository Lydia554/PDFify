const fs = require('fs');
const path = require('path');
const { postProcessPdfStrict } = require('../server/utils/postProcessPdfStrict');

const { validatePDFA3bStrict } = require('../tools/pdfa3b-validator');

(async () => {
  try {
    // 1️⃣ Load original PDF
    const inputPdfPath = path.resolve(__dirname, 'Gen.pdf');
    if (!fs.existsSync(inputPdfPath)) throw new Error('Input PDF not found');
    const pdfBytes = fs.readFileSync(inputPdfPath);
    console.log('📄 Loaded input PDF:', inputPdfPath);

    // 2️⃣ Load ICC profile
    const iccPath = path.resolve(__dirname, "../server/routes/sRGB_v4_ICC_preference.icc");
    if (!fs.existsSync(iccPath)) throw new Error('ICC profile not found');
    console.log('🎨 Using ICC profile:', iccPath);

    // 3️⃣ Load XMP metadata
    const xmpPath = path.resolve(__dirname, '../server/xmp/zugferd.xmp');
    console.log('📝 Using XMP metadata:', xmpPath);

    // 4️⃣ Load optional ZUGFeRD XML
    const zugferdXmlPath = path.resolve(__dirname, 'zugferd.xml');
    const zugferdXml = fs.existsSync(zugferdXmlPath)
      ? fs.readFileSync(zugferdXmlPath, 'utf8')
      : null;
    if (zugferdXml) console.log('📎 ZUGFeRD XML loaded:', zugferdXmlPath);

    // 5️⃣ Post-process PDF
    const finalPdf = await postProcessPdfStrict(pdfBytes, iccPath, xmpPath, zugferdXml);

    // 6️⃣ Save processed PDF
    const outputPath = path.resolve(__dirname, 'Gen_postprocessed.pdf');
    fs.writeFileSync(outputPath, finalPdf);
    console.log('✅ PDF post-processed and saved to:', outputPath);

    // 7️⃣ Validate PDF/A-3b compliance
    const result = await validatePDFA3bStrict(finalPdf);
    console.log('📊 Validator result:', JSON.stringify(result, null, 2));

  } catch (err) {
    console.error('❌ Error in post-processing test:', err);
  }
})();
