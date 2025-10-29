const fs = require("fs");
const { PDFDocument, PDFName, PDFArray, PDFString } = require("pdf-lib");

async function extractZugferdXml(filePath) {
  const pdfBytes = fs.readFileSync(filePath);
  const pdfDoc = await PDFDocument.load(pdfBytes);

  let found = false;

  // 1️⃣ Check AF in catalog
  const afRef = pdfDoc.catalog.get(PDFName.of("AF"));
  if (afRef) {
    const afArray = pdfDoc.context.lookup(afRef);
    const refs = afArray instanceof PDFArray ? afArray.asArray() : [afArray];
    for (const ref of refs) {
      const fileSpec = pdfDoc.context.lookup(ref);
      const efDict = fileSpec.get(PDFName.of("EF"));
      if (!efDict) continue;
      const fStream = pdfDoc.context.lookup(efDict.get(PDFName.of("F")));
      const xmlBytes = fStream.getContents();
      const fname = fileSpec.get(PDFName.of("F"))?.value || "zugferd.xml";
      fs.writeFileSync(fname, xmlBytes);
      console.log(`✅ Extracted from AF: ${fname}`);
      found = true;
    }
  }

  // 2️⃣ Check Names → EmbeddedFiles
  const namesRef = pdfDoc.catalog.get(PDFName.of("Names"));
  if (namesRef) {
    const namesDict = pdfDoc.context.lookup(namesRef);
    const efRef = namesDict.get(PDFName.of("EmbeddedFiles"));
    if (efRef) {
      const efDict = pdfDoc.context.lookup(efRef);
      const namesArray = efDict.get(PDFName.of("Names"));
      if (namesArray && namesArray.length % 2 === 0) {
        for (let i = 0; i < namesArray.length; i += 2) {
          const nameObj = namesArray[i];
          const fileSpecRef = namesArray[i + 1];
          const fileSpec = pdfDoc.context.lookup(fileSpecRef);
          const efDict = fileSpec.get(PDFName.of("EF"));
          if (!efDict) continue;
          const fStream = pdfDoc.context.lookup(efDict.get(PDFName.of("F")));
          const xmlBytes = fStream.getContents();
          const fname = fileSpec.get(PDFName.of("F"))?.value || "zugferd.xml";
          fs.writeFileSync(fname, xmlBytes);
          console.log(`✅ Extracted from Names: ${fname}`);
          found = true;
        }
      }
    }
  }

  if (!found) {
    console.log("❌ No embedded ZUGFeRD XML found.");
  }
}




extractZugferdXml("./Order_10348230934851.pdf");

