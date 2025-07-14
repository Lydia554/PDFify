const fs = require("fs");
const path = require("path");
const { diffLines } = require("diff");
const { DOMParser, XMLSerializer } = require("xmldom");

const pdfPath = process.argv[2];
const expectedXmpPath = path.join(__dirname, "expected-xmp.xml");

if (!pdfPath) {
  console.error("❌ Usage: node compare-xmp.js <pdf-file>");
  process.exit(1);
}

const pdfText = fs.readFileSync(pdfPath, "utf8");

// Extract XMP metadata between <?xpacket begin= and <?xpacket end=>
const xmpMatch = pdfText.match(/<\?xpacket begin=['"].*?['"][^>]*>([\s\S]*?)<\?xpacket end=['"].*?['"]\?>/);

if (!xmpMatch) {
  console.error("❌ No XMP packet found in PDF.");
  process.exit(1);
}

const actualXmp = xmpMatch[1].trim();
console.log("✅ Extracted XMP from PDF.");

const expectedXmp = fs.readFileSync(expectedXmpPath, "utf8").trim();

// XML validation function
function validateXML(xmlString, label) {
  try {
    const doc = new DOMParser({
      errorHandler: {
        warning: (w) => console.warn(`XML Warning in ${label}:`, w),
        error: (e) => {
          throw new Error(e);
        },
        fatalError: (e) => {
          throw new Error(e);
        },
      },
    }).parseFromString(xmlString, "application/xml");

    const errors = doc.getElementsByTagName("parsererror");
    if (errors.length > 0) {
      throw new Error(errors[0].textContent);
    }
    console.log(`✅ ${label} is well-formed XML.`);
    return true;
  } catch (err) {
    console.error(`❌ ${label} XML parse error:`, err.message);
    return false;
  }
}

// Check PDF/A Identification schema presence
function hasPdfAidSchema(xmlString) {
  return (
    xmlString.includes('xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"') &&
    /pdfaid:part="3"/.test(xmlString) &&
    /pdfaid:conformance="B"/.test(xmlString)
  );
}

// UTF-8 check function
function isUtf8(str) {
  return Buffer.from(str, "utf8").toString("utf8") === str;
}

// Run validations
validateXML(expectedXmp, "Expected XMP");
validateXML(actualXmp, "Actual XMP");

if (!isUtf8(actualXmp)) {
  console.warn("⚠️ Actual XMP is not valid UTF-8!");
} else {
  console.log("✅ Actual XMP encoding is valid UTF-8.");
}

if (!hasPdfAidSchema(actualXmp)) {
  console.warn("⚠️ PDF/A Identification schema is missing or incorrect in actual XMP!");
} else {
  console.log("✅ PDF/A Identification schema present in actual XMP.");
}

// Diff and pretty print
function prettyPrintXML(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, "application/xml");
  return new XMLSerializer().serializeToString(doc);
}

const expectedPretty = prettyPrintXML(expectedXmp);
const actualPretty = prettyPrintXML(actualXmp);

const diff = diffLines(expectedPretty, actualPretty);

console.log("\n🔍 Diff between expected XMP and actual embedded XMP:\n");
diff.forEach((part) => {
  const color = part.added ? "\x1b[32m" : part.removed ? "\x1b[31m" : "\x1b[0m";
  process.stdout.write(color + part.value + "\x1b[0m");
});
console.log();
