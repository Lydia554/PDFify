const fs = require("fs");
const path = require("path");
const { PDFDocument, PDFName, PDFHexString } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const generateZugferdXml = require("../../xml/generateZugferdXml");

/**
 * Generate complete PDF/A-3b + ZUGFeRD 2.3 compliant XMP metadata.
 * This version corrects the namespaces and structure for modern e-invoicing standards.
 */
function generatePdfA3bXmp(invoiceData) {
  const now = new Date().toISOString();
  const orderId = invoiceData.orderId || 'UNKNOWN';
  const zugferdFilename = `factur-x.xml`; // ZUGFeRD 2.x standard filename
  const conformanceLevel = "EN 16931"; // A common ZUGFeRD 2.x profile

  return `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 5.6-c011 79.156380, 2014/05/21-23:38:37        ">
   <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
      <rdf:Description rdf:about=""
            xmlns:xmp="http://ns.adobe.com/xap/1.0/"
            xmlns:pdf="http://ns.adobe.com/pdf/1.3/"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
         <xmp:CreateDate>${now}</xmp:CreateDate>
         <xmp:CreatorTool>PDFify v1.1 (pdf-lib)</xmp:CreatorTool>
         <pdf:Producer>pdf-lib</pdf:Producer>
         <dc:format>application/pdf</dc:format>
         <dc:title>
            <rdf:Alt>
               <rdf:li xml:lang="x-default">Invoice ${orderId}</rdf:li>
            </rdf:Alt>
         </dc:title>
         <pdfaid:part>3</pdfaid:part>
         <pdfaid:conformance>B</pdfaid:conformance>
      </rdf:Description>
      <rdf:Description rdf:about=""
            xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:1p0#">
         <fx:DocumentType>INVOICE</fx:DocumentType>
         <fx:DocumentFileName>${zugferdFilename}</fx:DocumentFileName>
         <fx:Version>1.0</fx:Version>
         <fx:ConformanceLevel>${conformanceLevel}</fx:ConformanceLevel>
      </rdf:Description>
   </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/**
 * Embed ICC color profile for PDF/A-3b compliance
 */
async function embedIccProfile(pdfDoc) {
  const iccProfilePath = path.join(__dirname, "sRGB2014.icc");

  if (!fs.existsSync(iccProfilePath)) {
    console.warn("⚠️ ICC profile not found, skipping OutputIntent");
    return;
  }

  const iccProfileBytes = fs.readFileSync(iccProfilePath);
  const iccStream = pdfDoc.context.stream(iccProfileBytes, { N: 3 });
  const iccRef = pdfDoc.context.register(iccStream);

  const outputIntent = pdfDoc.context.obj({
    Type: PDFName.of("OutputIntent"),
    S: PDFName.of("GTS_PDFA1"),
    OutputConditionIdentifier: PDFHexString.fromText("sRGB IEC61966-2.1"),
    RegistryName: PDFHexString.fromText("http://www.color.org"),
    Info: PDFHexString.fromText("sRGB IEC61966-2.1"),
    DestOutputProfile: iccRef
  });
  pdfDoc.catalog.set(PDFName.of("OutputIntents"), pdfDoc.context.obj([outputIntent]));
  console.log("✅ ICC color profile embedded");
}

async function embedZugferdXml(pdfDoc, invoiceData) {
  console.log("🟢 Embedding ZUGFeRD XML for order:", invoiceData.orderId);
  const xmlString = generateZugferdXml(invoiceData);
  const zugferdFilename = `factur-x.xml`;
  console.log(`🔍 ZUGFeRD XML string length: ${xmlString.length} bytes`);

  const xmlStream = pdfDoc.context.flateStream(Buffer.from(xmlString, "utf8"));
  const xmlRef = pdfDoc.context.register(xmlStream);

  const fileSpec = pdfDoc.context.obj({
    Type: PDFName.of("Filespec"),
    F: PDFHexString.fromText(zugferdFilename),
    UF: PDFHexString.fromText(zugferdFilename),
    EF: pdfDoc.context.obj({ F: xmlRef }),
    AFRelationship: PDFName.of("Alternative"),
  });
  const fileSpecRef = pdfDoc.context.register(fileSpec);

  let names = pdfDoc.catalog.lookupMaybe(PDFName.of("Names"));
  if (!names) {
    console.log("📁 Names dictionary not found, creating new one");
    names = pdfDoc.context.obj({
      EmbeddedFiles: pdfDoc.context.obj({
        Names: [PDFHexString.fromText(zugferdFilename), fileSpecRef],
      }),
    });
    pdfDoc.catalog.set(PDFName.of("Names"), names);
  } else {
    console.log("📁 Names dictionary exists, updating");
    let embeddedFiles = names.lookupMaybe(PDFName.of("EmbeddedFiles"));
    if (!embeddedFiles) {
      embeddedFiles = pdfDoc.context.obj({ Names: [] });
      names.set(PDFName.of("EmbeddedFiles"), embeddedFiles);
    }

    let namesArray = embeddedFiles.lookupMaybe(PDFName.of("Names"));
    if (!namesArray) {
      namesArray = pdfDoc.context.obj([]);
      embeddedFiles.set(PDFName.of("Names"), namesArray);
    }
    
    namesArray.push(PDFHexString.fromText(zugferdFilename), fileSpecRef);
  }

  const afArray = pdfDoc.context.obj([fileSpecRef]);
  pdfDoc.catalog.set(PDFName.of("AF"), afArray);
  console.log("✅ ZUGFeRD XML embedded successfully");
}


/**
 * Main function: Convert PDF to PDF/A-3b + ZUGFeRD
 */
async function convertToPdfA3b(pdfBuffer, invoiceData) {
  console.log("🔄 Converting to PDF/A-3b + ZUGFeRD using pdf-lib (v3)...");
  console.log(`🔍 Initial PDF Buffer size: ${pdfBuffer.length} bytes`);

  const pdfDoc = await PDFDocument.load(pdfBuffer);
  console.log(`🔍 Initial PDF page count: ${pdfDoc.getPages().length}`);

  // 1. Embed XMP metadata
  const xmp = generatePdfA3bXmp(invoiceData);
  console.log(`🔍 XMP Metadata string length: ${xmp.length} bytes`);
  pdfDoc.catalog.set(
    PDFName.of('Metadata'),
    pdfDoc.context.stream(xmp, {
      Type: 'Metadata',
      Subtype: 'XML',
      Length: xmp.length,
    })
  );
  console.log("✅ XMP metadata embedded");

  // 2. Embed ICC color profile
  await embedIccProfile(pdfDoc);

  // 3. Embed ZUGFeRD XML
  await embedZugferdXml(pdfDoc, invoiceData);

  // 4. Save with PDF/A-3b compatible settings
  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });

  console.log(`🔍 Final PDF Buffer size: ${pdfBytes.length} bytes`);
  const finalPdfDoc = await PDFDocument.load(pdfBytes);
  console.log(`🔍 Final PDF page count: ${finalPdfDoc.getPages().length}`);

  console.log("✅ PDF/A-3b conversion complete");
  return Buffer.from(pdfBytes);
}

async function convertToPdfA3b_v2(pdfBuffer, invoiceData) {
    console.log("🔄 Converting to PDF/A-3b using pdf-lib (v4 - fresh attempt)...");
    
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    pdfDoc.registerFontkit(fontkit);

    // Embed fonts
    const fontBytes = fs.readFileSync(path.join(__dirname, '../../templates/fonts/LiberationSans-Regular.ttf'));
    await pdfDoc.embedFont(fontBytes);

    // Embed ICC Profile
    const iccProfileBytes = fs.readFileSync(path.join(__dirname, "sRGB2014.icc"));
    const iccStream = pdfDoc.context.stream(iccProfileBytes, { N: 3 });
    const iccRef = pdfDoc.context.register(iccStream);
    const outputIntent = pdfDoc.context.obj({
        Type: PDFName.of("OutputIntent"),
        S: PDFName.of("GTS_PDFA1"),
        OutputConditionIdentifier: PDFHexString.fromText("sRGB IEC61966-2.1"),
        RegistryName: PDFHexString.fromText("http://www.color.org"),
        Info: PDFHexString.fromText("sRGB IEC61966-2.1"),
        DestOutputProfile: iccRef
    });
    pdfDoc.catalog.set(PDFName.of("OutputIntents"), pdfDoc.context.obj([outputIntent]));

    // Embed ZUGFeRD XML
    const xmlString = generateZugferdXml(invoiceData);
    const xmlBytes = Buffer.from(xmlString, "utf8");
    await pdfDoc.attach(xmlBytes, 'factur-x.xml', {
        mimeType: 'application/xml',
        afRelationship: 'Alternative',
    });

    // Embed XMP Metadata
    const xmp = generatePdfA3bXmp(invoiceData);
    pdfDoc.catalog.set(
        PDFName.of('Metadata'),
        pdfDoc.context.stream(xmp, {
            Type: 'Metadata',
            Subtype: 'XML',
            Length: xmp.length,
        })
    );

    const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
    return Buffer.from(pdfBytes);
}

module.exports = {
  convertToPdfA3b,
  generatePdfA3bXmp,
  convertToPdfA3b_v2,
  embedZugferdXml,
};

