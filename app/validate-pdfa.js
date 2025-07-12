const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

// Define paths
const pdfDir = path.resolve(__dirname, "pdfs");
const pdfPath = path.resolve(__dirname, "test", "output-with-xmp.pdf");


// VeraPDF CLI full path (adjust if needed)
const verapdfPath = `"C:\\Users\\goldb\\Pro\\verapdf-pdfbox-1.28.1\\verapdf.bat"`;

// Ensure pdfs directory exists
if (!fs.existsSync(pdfDir)) {
  fs.mkdirSync(pdfDir, { recursive: true });
  console.log("📁 Created pdfs directory");
}

// Check if PDF exists
if (!fs.existsSync(pdfPath)) {
  console.error("❌ PDF file does not exist at:", pdfPath);
  process.exit(1);
}

console.log("📂 PDF directory:", pdfDir);
console.log("📄 PDF file path:", pdfPath);
console.log("🔎 Running VeraPDF validation...");

exec(`${verapdfPath} --format text "${pdfPath}"`, (error, stdout, stderr) => {
  if (error) {
    console.error("❌ VeraPDF validation error:", error.message);
    process.exit(1);
  }

  if (stderr) {
    // VeraPDF sometimes writes warnings to stderr, not errors
    console.warn("⚠️ VeraPDF warnings:\n", stderr.trim());
  }

  console.log("📋 VeraPDF validation result:\n");
  console.log(stdout.trim());

  // Check if output contains errors
  if (/fail|error|non-compliant/i.test(stdout)) {
    console.error("❌ PDF validation FAILED.");
    process.exit(1);
  } else {
    console.log("✅ PDF validation PASSED.");
    process.exit(0);
  }
});
