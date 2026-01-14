const { PDFDocument, PDFName } = require("pdf-lib");

(async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  
  // The user's proposed line:
  doc.catalog.set(
    PDFName.of('Version'), 
    PDFName.of('1.7' + " ".repeat(10)) // Using 10 spaces for test
  );

  const pdfBytes = await doc.save({ useObjectStreams: false });
  const pdfString = Buffer.from(pdfBytes).toString('latin1');
  
  console.log("--- PDF CONTENT SNIPPET ---");
  const match = pdfString.match(/\/Version\s*[^\n\r>]+/);
  if (match) {
      console.log("Found:", match[0]);
  } else {
      console.log("Not found using simple regex. Searching for 'Version'...");
      const idx = pdfString.indexOf('/Version');
      if (idx !== -1) {
          console.log("Context:", pdfString.substring(idx, idx + 50));
      } else {
          console.log("Version key not found!");
      }
  }
})();

