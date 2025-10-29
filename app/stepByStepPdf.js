const fs = require("fs");
const path = require("path");
const { PDFDocument, PDFName, PDFString, PDFHexString } = require("pdf-lib");

//  Your existing working embedXmlIntoPdf function
function embedXmlIntoPdf(pdfDoc, xml) {
if (!xml) return pdfDoc;

const xmlBytes = Buffer.from(xml.trim(), "utf8");

const xmlStream = pdfDoc.context.flateStream(xmlBytes, {
Type: PDFName.of("EmbeddedFile"),
Subtype: PDFName.of("text#2Fxml"),
});

const fileSpecDict = pdfDoc.context.obj({
Type: "Filespec",
F: PDFString.of("ZUGFeRD-invoice.xml"),
UF: PDFString.of("ZUGFeRD-invoice.xml"),
AFRelationship: PDFName.of("Alternative"),
EF: { F: xmlStream },
});

const fileSpecRef = pdfDoc.context.register(fileSpecDict);
const catalog = pdfDoc.catalog;
catalog.set(PDFName.of("AF"), pdfDoc.context.obj([fileSpecRef]));

const namesDict = pdfDoc.context.obj({
EmbeddedFiles: pdfDoc.context.obj({
Names: [PDFString.of("ZUGFeRD-invoice.xml"), fileSpecRef],
}),
});
catalog.set(PDFName.of("Names"), namesDict);

return pdfDoc;
}

//  ICC profile (you can swap with your own sRGB.icc)
const iccProfilePath = path.resolve("C:/Users/goldb/Pro/PDF-API/app/server/Helpers/sRGB_v4_ICC_preference.icc");


// PDF/A metadata strings
const XMP_METADATA = `<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?>
<x:xmpmeta xmlns:x='adobe:ns:meta/'>
<rdf:RDF xmlns:rdf='[http://www.w3.org/1999/02/22-rdf-syntax-ns#'>](http://www.w3.org/1999/02/22-rdf-syntax-ns#'>)
<rdf:Description xmlns:pdfaid='[http://www.aiim.org/pdfa/ns/id/](http://www.aiim.org/pdfa/ns/id/)' rdf:about=''>
[pdfaid:part](pdfaid:part)3</pdfaid:part>
[pdfaid:conformance](pdfaid:conformance)B</pdfaid:conformance>
</rdf:Description>
</rdf:RDF>
</x:xmpmeta>

<?xpacket end='w'?>`;

async function stepByStepPdf() {
const basePdfPath = "./Order_10348230934851.pdf"; 
const zugferdXmlPath = "./extracted-ZUGFeRD-invoice.xml";
const xml = fs.readFileSync(zugferdXmlPath, "utf8");
const iccBytes = fs.readFileSync(iccProfilePath);

// Phase 1: Base PDF
console.log("🧩 Phase 1: Loading base PDF...");
const baseBytes = fs.readFileSync(basePdfPath);
const pdf1 = await PDFDocument.load(baseBytes);
fs.writeFileSync("./phase1_base.pdf", await pdf1.save());
console.log("   → Saved phase1_base.pdf (open in VeraPDF to confirm it loads)\n");

//  Phase 2: Add XMP metadata
console.log("🧩 Phase 2: Adding XMP metadata...");
const pdf2 = await PDFDocument.load(await pdf1.save());
const metadataStream = pdf2.context.flateStream(Buffer.from(XMP_METADATA, "utf8"));
pdf2.catalog.set(PDFName.of("Metadata"), pdf2.context.register(metadataStream));
fs.writeFileSync("./phase2_metadata.pdf", await pdf2.save());
console.log("   → Saved phase2_metadata.pdf (check VeraPDF: should show pdfaid:part=3)\n");

// Phase 3: Add ICC OutputIntent
console.log("🧩 Phase 3: Adding ICC profile...");
const pdf3 = await PDFDocument.load(await pdf2.save());
const iccStream = pdf3.context.flateStream(iccBytes, {
N: 3,
Alternate: PDFName.of("DeviceRGB"),
});
const outputIntentDict = pdf3.context.obj({
Type: "OutputIntent",
S: PDFName.of("GTS_PDFA1"),
OutputConditionIdentifier: PDFString.of("sRGB IEC61966-2.1"),
Info: PDFString.of("sRGB IEC61966-2.1"),
DestOutputProfile: iccStream,
});
pdf3.catalog.set(PDFName.of("OutputIntents"), pdf3.context.obj([outputIntentDict]));
fs.writeFileSync("./phase3_icc.pdf", await pdf3.save());
console.log("   → Saved phase3_icc.pdf (check VeraPDF: should detect OutputIntent)\n");

// Phase 4: Embed XML
console.log("🧩 Phase 4: Embedding ZUGFeRD XML...");
const pdf4 = await PDFDocument.load(await pdf3.save());
await embedXmlIntoPdf(pdf4, xml);
fs.writeFileSync("./phase4_embedded.xml.pdf", await pdf4.save());
console.log("   → Saved phase4_embedded.xml.pdf (should open in VeraPDF, list AF attachment)\n");

// Phase 5: Final candidate
console.log("🧩 Phase 5: Saving final candidate...");
const pdf5 = await PDFDocument.load(await pdf4.save());
fs.writeFileSync("./phase5_final.pdf", await pdf5.save());
console.log("✅ Saved phase5_final.pdf\n");
console.log("👉 Now test each phase manually in VeraPDF and note when it stops opening.");
}

stepByStepPdf().catch(console.error);
