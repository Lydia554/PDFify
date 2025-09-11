const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');
const { PDFDocument, PDFName, PDFDict, PDFArray, PDFString, PDFHexString, PDFRawStream } = require('pdf-lib');
const { validatePDFA3bStrict } = require('../tools/pdfa3b-validator');

(async () => {
  try {
    // 1️⃣ Load original PDF
    const inputPdfPath = path.resolve(__dirname, 'Gen.pdf');
    if (!fs.existsSync(inputPdfPath)) throw new Error('Input PDF not found');
    console.log('📄 Loaded input PDF:', inputPdfPath);

    // 2️⃣ Detect Ghostscript executable
    const possibleGsPaths = [
      'C:\\Program Files\\gs\\gs10.05.1\\bin\\gswin64c.exe',
      'C:\\Program Files (x86)\\gs\\gs10.05.1\\bin\\gswin32c.exe',
      'gswin64c', 'gswin32c', 'gs'
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
    const iccBytes = fs.readFileSync(iccPath);

    // 5️⃣ Convert to PDF/A-3b using Ghostscript
    execFileSync(gsExe, [
      '-dPDFA=3', '-dBATCH', '-dNOPAUSE', '-sDEVICE=pdfwrite',
      '-dEmbedAllFonts=true', '-dSubsetFonts=true',
      '-dPreserveDocInfo=true', '-dPreserveAnnots=true', '-dPDFACompatibilityPolicy=1',
      '-dAutoRotatePages=/None', '-sColorConversionStrategy=RGB', '-dProcessColorModel=/DeviceRGB',
      '-dConvertCMYKImagesToRGB=true', '-dDownsampleColorImages=false', '-dDownsampleGrayImages=false',
      '-dDownsampleMonoImages=false', '-dPDFSETTINGS=/prepress',
      `-sOutputFile=${gsOutputPath}`,
      inputPdfPath
    ], { stdio: 'inherit' });

    console.log('✅ Ghostscript PDF/A-3b generated:', gsOutputPath);

    // 6️⃣ Load PDF into pdf-lib
    const pdfBytes = fs.readFileSync(gsOutputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // 7️⃣ Add OutputIntents dictionary with proper ICC embedding
    const pdfContext = pdfDoc.context;
    const iccStream = pdfContext.flateStream(iccBytes, {
      Type: 'Metadata',
      Subtype: 'XML',
      Length: iccBytes.length
    });
    const iccRef = pdfContext.register(iccStream);

    const outputIntentDict = pdfContext.obj({
      Type: 'OutputIntent',
      S: PDFName.of('GTS_PDFA1'),
      OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
      DestOutputProfile: iccRef
    });

    const outputIntentsArray = pdfContext.obj([outputIntentDict]);
    pdfDoc.catalog.set(PDFName.of('OutputIntents'), outputIntentsArray);

    // 8️⃣ Add minimal XMP with pdfaid:part=3 & pdfaid:conformance=B
    const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
    <x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="PDFify">
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
        <rdf:Description xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
          <pdfaid:part>3</pdfaid:part>
          <pdfaid:conformance>B</pdfaid:conformance>
        </rdf:Description>
      </rdf:RDF>
    </x:xmpmeta>
    <?xpacket end="w"?>`;

    const xmpStream = pdfContext.flateStream(Buffer.from(xmp, 'utf8'), {
      Type: 'Metadata',
      Subtype: 'XML'
    });
    const xmpRef = pdfContext.register(xmpStream);
    pdfDoc.catalog.set(PDFName.of('Metadata'), xmpRef);

    // 9️⃣ Save final PDF
    const finalPdf = await pdfDoc.save();
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
