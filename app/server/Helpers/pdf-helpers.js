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
<<<<<<< HEAD
  return `<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?>
<x:xmpmeta xmlns:x='adobe:ns:meta/'>
  <rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>
    <!-- Dublin Core Metadata -->
    <rdf:Description rdf:about=''
        xmlns:dc='http://purl.org/dc/elements/1.1/'>
      <dc:format>application/pdf</dc:format>
      <dc:title>
        <rdf:Alt>
          <rdf:li xml:lang='x-default'>Invoice ${orderId}</rdf:li>
        </rdf:Alt>
      </dc:title>
      <dc:creator>
        <rdf:Seq>
          <rdf:li>PDFify Invoice Generator</rdf:li>
        </rdf:Seq>
      </dc:creator>
      <dc:description>
        <rdf:Alt>
          <rdf:li xml:lang='x-default'>ZUGFeRD Invoice ${orderId}</rdf:li>
        </rdf:Alt>
      </dc:description>
    </rdf:Description>

    <!-- PDF/A Identification -->
    <rdf:Description rdf:about=''
        xmlns:pdfaid='http://www.aiim.org/pdfa/ns/id/'>
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>

    <!-- XMP Basic Metadata -->
    <rdf:Description rdf:about=''
        xmlns:xmp='http://ns.adobe.com/xap/1.0/'>
      <xmp:CreatorTool>PDFify v1.0 (Puppeteer + pdf-lib)</xmp:CreatorTool>
      <xmp:CreateDate>${now}</xmp:CreateDate>
      <xmp:ModifyDate>${now}</xmp:ModifyDate>
      <xmp:MetadataDate>${now}</xmp:MetadataDate>
    </rdf:Description>

    <!-- PDF Extension Schema for ZUGFeRD -->
    <rdf:Description rdf:about=''
        xmlns:pdfaExtension='http://www.aiim.org/pdfa/ns/extension/'
        xmlns:pdfaSchema='http://www.aiim.org/pdfa/ns/schema#'
        xmlns:pdfaProperty='http://www.aiim.org/pdfa/ns/property#'>
      <pdfaExtension:schemas>
        <rdf:Bag>
          <rdf:li rdf:parseType='Resource'>
            <pdfaSchema:schema>ZUGFeRD PDFA Extension Schema</pdfaSchema:schema>
            <pdfaSchema:namespaceURI>urn:ferd:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
            <pdfaSchema:prefix>zf</pdfaSchema:prefix>
            <pdfaSchema:property>
              <rdf:Seq>
                <rdf:li rdf:parseType='Resource'>
                  <pdfaProperty:name>DocumentFileName</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>Name of the embedded ZUGFeRD invoice XML file</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType='Resource'>
                  <pdfaProperty:name>DocumentType</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>Type of the embedded ZUGFeRD data</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType='Resource'>
                  <pdfaProperty:name>ConformanceLevel</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>ZUGFeRD conformance level</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType='Resource'>
                  <pdfaProperty:name>Version</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>ZUGFeRD version</pdfaProperty:description>
                </rdf:li>
              </rdf:Seq>
            </pdfaSchema:property>
          </rdf:li>
        </rdf:Bag>
      </pdfaExtension:schemas>
    </rdf:Description>

    <!-- ZUGFeRD Metadata -->
    <rdf:Description rdf:about=''
        xmlns:zf='urn:ferd:pdfa:CrossIndustryDocument:invoice:1p0#'>
      <zf:DocumentFileName>ZUGFeRD-invoice-${orderId}.xml</zf:DocumentFileName>
      <zf:DocumentType>INVOICE</zf:DocumentType>
      <zf:ConformanceLevel>BASIC</zf:ConformanceLevel>
      <zf:Version>1.0</zf:Version>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
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

