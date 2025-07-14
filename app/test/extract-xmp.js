const fs = require("fs");
const path = require("path");

const pdfPath = process.argv[2];
const outputXmpPath = path.join(__dirname, "expected-xmp.xml");

if (!pdfPath) {
  console.error("Usage: node extract-xmp.js <pdf-file>");
  process.exit(1);
}

const pdfText = fs.readFileSync(pdfPath, "utf8");

// Extract XMP metadata between <?xpacket begin= and <?xpacket end=>
const xmpMatch = pdfText.match(/<\?xpacket begin=['"].*?['"][^>]*>([\s\S]*?)<\?xpacket end=['"].*?['"]\?>/);

if (!xmpMatch) {
  console.error("No XMP packet found in PDF.");
  process.exit(1);
}

const actualXmp = xmpMatch[1].trim();

fs.writeFileSync(outputXmpPath, actualXmp, "utf8");
console.log(`✅ Extracted XMP saved to ${outputXmpPath}`);
