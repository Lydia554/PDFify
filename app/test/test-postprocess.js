const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');
const { PDFDocument, PDFName, PDFString } = require("pdf-lib");
const { validatePDFA3bStrict } = require('../tools/pdfa3b-validator');

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
      'gswin64c',
      'gswin32c',
      'gs'
    ];
    const gsExe = possibleGsPaths.find(p => {
      if (fs.existsSync(p)) return true;
      try { execSync(`${p} -v`, { stdio: 'ignore' }); return true; } catch { return false; }
    });
    if (!gsExe) throw new Error('Ghostscript not found. Install it or add to PATH.');
    console.log('🎯 Using Ghostscript executable:', gsExe);

    // 3️⃣ Output path for Ghostscript PDF/A-3b
    const gsOutputPath = path.resolve(__dirname, 'Gen_gs.pdf');

    // 4️⃣ ICC profile path
    const iccPath = path.resolve(__dirname, '../server/routes/sRGB_v4_ICC_preference.icc');
    if (!fs.existsSync(iccPath)) throw new Error('ICC profile not found');

    // 5️⃣ Convert to PDF/A-3b using Ghostscript
    execFileSync(gsExe, [
      '-dPDFA=3', '-dBATCH', '-dNOPAUSE', '-sDEVICE=pdfwrite',
      '-dEmbedAllFonts=true', '-dSubsetFonts=true',
      '-dPreserveDocInfo=true', '-dPreserveAnnots=true', '-dPDFACompatibilityPolicy=1',
      '-dAutoRotatePages=/None', '-sColorConversionStrategy=RGB', '-dProcessColorModel=/DeviceRGB',
      '-dConvertCMYKImagesToRGB=true', '-dDownsampleColorImages=false', '-dDownsampleGrayImages=false',
      '-dDownsampleMonoImages=false', '-dPDFSETTINGS=/prepress',
      `-sOutputICCProfile=${iccPath}`,
      `-sOutputFile=${gsOutputPath}`,
      inputPdfPath
    ], { stdio: 'inherit' });

    console.log('✅ Ghostscript PDF/A-3b generated:', gsOutputPath);

    // 6️⃣ Load PDF bytes from Ghostscript output
    let pdfBytes = fs.readFileSync(gsOutputPath);

    // 7️⃣ Minimal fix for OutputIntents + XMP
    async function fixPdfForPDFA(pdfBytes, iccPath) {
      const pdfDoc = await PDFDocument.load(pdfBytes, { updateMetadata: false });
      const ctx = pdfDoc.context;
      const catalog = pdfDoc.catalog;

      // Debug before changes
      console.log("🔍 Before: /OutputIntents =", catalog.get(PDFName.of("OutputIntents")) ? "FOUND" : "MISSING");
      console.log("🔍 Before: /Metadata =", catalog.get(PDFName.of("Metadata")) ? "FOUND" : "MISSING");

      // ✅ Inject OutputIntents if missing
      if (!catalog.get(PDFName.of("OutputIntents"))) {
        const iccData = fs.readFileSync(iccPath);
        const iccStream = ctx.flateStream(iccData, { N: 3, Alternate: PDFName.of("DeviceRGB") });
        const oi = ctx.obj({
          Type: PDFName.of("OutputIntent"),
          S: PDFName.of("GTS_PDFA1"),
          OutputConditionIdentifier: PDFString.of("sRGB IEC61966-2.1"),
          Info: PDFString.of("sRGB IEC61966-2.1"),
          DestOutputProfile: iccStream
        });
        catalog.set(PDFName.of("OutputIntents"), ctx.obj([oi]));
        console.log("✅ Added OutputIntents");
      }

      // ✅ Add minimal XMP metadata
      const xmp = `<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?>
      <x:xmpmeta xmlns:x='adobe:ns:meta/'>
        <rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>
          <rdf:Description xmlns:pdfaid='http://www.aiim.org/pdfa/ns/id/'>
            <pdfaid:part>3</pdfaid:part>
            <pdfaid:conformance>B</pdfaid:conformance>
          </rdf:Description>
        </rdf:RDF>
      </x:xmpmeta>
      <?xpacket end='w'?>`;

      const metaStream = ctx.flateStream(xmp);
      catalog.set(PDFName.of("Metadata"), metaStream);
      console.log("✅ Injected minimal XMP");

      // Debug after changes
      console.log("🔍 After: /OutputIntents =", catalog.get(PDFName.of("OutputIntents")) ? "FOUND" : "MISSING");
      console.log("🔍 After: /Metadata =", catalog.get(PDFName.of("Metadata")) ? "FOUND" : "MISSING");

      return await pdfDoc.save({ useObjectStreams: false });
    }

    // Apply fixes
    const finalPdf = await fixPdfForPDFA(pdfBytes, iccPath);

    // 🔟 Save final PDF
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
