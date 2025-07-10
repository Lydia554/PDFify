const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

// Use the 'pdfs' folder for PDFs
const pdfDir = path.resolve(__dirname, "pdfs");
const pdfPath = path.join(pdfDir, "latest-invoice.pdf");

// Log the paths for debugging
console.log("📂 PDF directory:", pdfDir);
console.log("📄 PDF file path:", pdfPath);

// Check if pdfs folder exists, if not create it
if (!fs.existsSync(pdfDir)) {
  fs.mkdirSync(pdfDir, { recursive: true });
  console.log("📁 Created pdfs directory");
}

// Check if the PDF file exists before running VeraPDF
if (!fs.existsSync(pdfPath)) {
  console.error("❌ PDF file does not exist at:", pdfPath);
  process.exit(1);
}

// Full path to verapdf.bat - adjust if needed
const verapdfPath = `"C:\\Users\\goldb\\Pro\\verapdf-pdfbox-1.28.1\\verapdf.bat"`;

// Run verapdf using full path
exec(`${verapdfPath} --format text "${pdfPath}"`, (error, stdout, stderr) => {
  if (error) {
    console.error("❌ VeraPDF validation error:", error.message);
    return;
  }
  if (stderr) {
    console.warn("⚠️ VeraPDF stderr:", stderr);
  }
  console.log("📋 VeraPDF validation result:\n");
  console.log(stdout);
});
