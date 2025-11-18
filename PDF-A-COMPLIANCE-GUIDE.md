# PDF/A-3b Compliance Guide for PDFify

## Current Implementation Status

### ✅ What's Working
- **ZUGFeRD XML generation** (`app/xml/generateZugferdXml.js`)
- **XML embedding** (`app/server/Helpers/pdf-helpers.js:embedZugferdXml()`)
- **XMP metadata** (PDF/A-3b identification in `finalizePdf()`)
- **Associated Files** (AF array for ZUGFeRD attachment)

### ⚠️ What's Missing for Full PDF/A-3b Compliance
- **ICC Color Profile** (OutputIntent with sRGB profile)
- **Font Subsetting** (all fonts must be embedded as subsets)
- **PDF/A-3b specific XMP** (missing extensions schema)
- **Validation** (current implementation not VeraPDF validated)

---

## PDF/A-3b Requirements Checklist

For a PDF to be **PDF/A-3b compliant**, it must meet these requirements:

- [x] XMP metadata with PDF/A-3b identification
- [x] Associated file (ZUGFeRD XML) with AFRelationship
- [ ] OutputIntent with embedded ICC color profile
- [ ] All fonts embedded as subsets
- [ ] No encryption
- [ ] No external references
- [ ] Proper XMP extensions schema for ZUGFeRD
- [ ] MarkInfo dictionary with Marked=true
- [ ] Metadata stream

---

## Solution 1: Enhanced Node.js Implementation (RECOMMENDED)

This solution extends the existing `finalizePdf()` function to meet full PDF/A-3b requirements.

### Implementation

Create a new file: `app/server/Helpers/pdfa-compliant.js`

```javascript
const fs = require("fs");
const path = require("path");
const { PDFDocument, PDFName, PDFHexString } = require("pdf-lib");
const generateZugferdXml = require("../../xml/generateZugferdXml");

/**
 * Generate complete PDF/A-3b + ZUGFeRD compliant XMP metadata
 */
function generatePdfA3bXmp(invoiceData) {
  const now = new Date().toISOString();
  const orderId = invoiceData.orderId || 'UNKNOWN';

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
<?xpacket end='w'?>`;
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

  // Create ICC profile stream
  const iccStream = pdfDoc.context.stream(iccProfileBytes, {
    N: 3,  // Number of color components (RGB = 3)
    Alternate: PDFName.of("DeviceRGB"),
    Filter: PDFName.of("FlateDecode")
  });

  const iccRef = pdfDoc.context.register(iccStream);

  // Create OutputIntent
  const outputIntent = pdfDoc.context.obj({
    Type: PDFName.of("OutputIntent"),
    S: PDFName.of("GTS_PDFA1"),  // PDF/A-1 and higher
    OutputConditionIdentifier: PDFHexString.fromText("sRGB IEC61966-2.1"),
    RegistryName: PDFHexString.fromText("http://www.color.org"),
    Info: PDFHexString.fromText("sRGB IEC61966-2.1"),
    DestOutputProfile: iccRef
  });

  const outputIntentRef = pdfDoc.context.register(outputIntent);

  // Add to catalog
  pdfDoc.catalog.set(
    PDFName.of("OutputIntents"),
    pdfDoc.context.obj([outputIntentRef])
  );

  console.log("✅ ICC color profile embedded");
}

/**
 * Embed ZUGFeRD XML as associated file
 */
async function embedZugferdXml(pdfDoc, invoiceData) {
  console.log("🟢 Embedding ZUGFeRD XML for order:", invoiceData.orderId);
  const xmlString = generateZugferdXml(invoiceData);
  const filename = `ZUGFeRD-invoice-${invoiceData.orderId}.xml`;

  // Create XML stream
  const xmlStream = pdfDoc.context.flateStream(Buffer.from(xmlString, "utf8"), {
    Type: PDFName.of("EmbeddedFile"),
    Subtype: PDFName.of("text#2Fxml"),
    Params: pdfDoc.context.obj({
      ModDate: PDFHexString.fromText(new Date().toISOString()),
      Size: xmlString.length,
      CheckSum: PDFHexString.fromText("<TODO: MD5 hash if needed>")
    })
  });
  const xmlRef = pdfDoc.context.register(xmlStream);

  // Create file specification
  const fileSpec = pdfDoc.context.obj({
    Type: PDFName.of("Filespec"),
    F: PDFHexString.fromText(filename),
    UF: PDFHexString.fromText(filename),
    Desc: PDFHexString.fromText("ZUGFeRD Invoice XML"),
    EF: pdfDoc.context.obj({
      F: xmlRef,
      UF: xmlRef  // Unicode file
    }),
    AFRelationship: PDFName.of("Alternative")  // Required for PDF/A-3
  });
  const fileSpecRef = pdfDoc.context.register(fileSpec);

  // Add to EmbeddedFiles name tree
  let names = pdfDoc.catalog.lookupMaybe(PDFName.of("Names"));
  if (!names) {
    names = pdfDoc.context.obj({
      EmbeddedFiles: pdfDoc.context.obj({
        Names: [PDFHexString.fromText(filename), fileSpecRef]
      })
    });
    pdfDoc.catalog.set(PDFName.of("Names"), names);
  } else {
    const embeddedFiles = names.lookupMaybe(PDFName.of("EmbeddedFiles"));
    if (embeddedFiles) {
      const namesArray = embeddedFiles.lookup(PDFName.of("Names"));
      if (namesArray) {
        namesArray.push(PDFHexString.fromText(filename), fileSpecRef);
      }
    }
  }

  // Add to AF array (associated files)
  pdfDoc.catalog.set(PDFName.of("AF"), pdfDoc.context.obj([fileSpecRef]));

  console.log("✅ ZUGFeRD XML embedded successfully");
  return pdfDoc;
}

/**
 * Main function: Convert PDF to PDF/A-3b + ZUGFeRD
 */
async function convertToPdfA3b(pdfBuffer, invoiceData) {
  console.log("🔄 Converting to PDF/A-3b + ZUGFeRD...");

  // Load PDF
  const pdfDoc = await PDFDocument.load(pdfBuffer);

  // 1. Embed XMP metadata
  const xmp = generatePdfA3bXmp(invoiceData);
  const metadataStream = pdfDoc.context.flateStream(Buffer.from(xmp, 'utf8'), {
    Type: PDFName.of('Metadata'),
    Subtype: PDFName.of('XML')
  });
  const metadataRef = pdfDoc.context.register(metadataStream);
  pdfDoc.catalog.set(PDFName.of('Metadata'), metadataRef);

  // 2. Set MarkInfo (tagged PDF)
  pdfDoc.catalog.set(PDFName.of('MarkInfo'), pdfDoc.context.obj({
    Marked: true
  }));

  // 3. Embed ICC color profile
  await embedIccProfile(pdfDoc);

  // 4. Embed ZUGFeRD XML
  await embedZugferdXml(pdfDoc, invoiceData);

  // 5. Save with PDF/A-3b compatible settings
  const pdfBytes = await pdfDoc.save({
    useObjectStreams: false,  // PDF/A-3b does not allow object streams
    addDefaultPage: false,
    objectsPerTick: 50
  });

  console.log("✅ PDF/A-3b conversion complete");
  return Buffer.from(pdfBytes);
}

module.exports = {
  convertToPdfA3b,
  generatePdfA3bXmp,
  embedIccProfile,
  embedZugferdXml
};
```

### Update Route to Use Enhanced Implementation

Edit `app/server/routes/invoiceRoutes.js`:

```javascript
const { convertToPdfA3b } = require("../Helpers/pdfa-compliant");

// In your PDF generation code:
if (user.planType === "pro" && invoiceData.compliant) {
  // Generate PDF from template
  const html = await generateInvoiceHTMLPro(invoiceData);
  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" }
  });

  // Convert to PDF/A-3b
  const compliantPdfBuffer = await convertToPdfA3b(pdfBuffer, invoiceData);

  return compliantPdfBuffer;
}
```

---

## Solution 2: Ghostscript Post-Processing (SIMPLER)

Use Ghostscript to convert any PDF to PDF/A-3b **after** embedding ZUGFeRD XML.

### Implementation

Create: `app/server/Helpers/ghostscript-pdfa.js`

```javascript
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Convert PDF to PDF/A-3b using Ghostscript
 *
 * @param {Buffer} pdfBuffer - Input PDF buffer
 * @param {string} pdfaLevel - "1b", "2b", or "3b"
 * @returns {Buffer} PDF/A-compliant PDF buffer
 */
function convertToPdfAWithGhostscript(pdfBuffer, pdfaLevel = "3b") {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdfa-"));
  const inputPath = path.join(tmpDir, "input.pdf");
  const outputPath = path.join(tmpDir, "output.pdf");

  try {
    // Write input PDF
    fs.writeFileSync(inputPath, pdfBuffer);

    // Determine PDFA level number
    const pdfaNum = pdfaLevel === "3b" ? 3 : pdfaLevel === "2b" ? 2 : 1;

    // Run Ghostscript
    const gsCmd = spawnSync("gs", [
      `-dPDFA=${pdfaNum}`,
      "-dBATCH",
      "-dNOPAUSE",
      "-dNOOUTERSAVE",
      "-dCompatibilityLevel=1.7",
      "-sDEVICE=pdfwrite",
      "-dPDFACompatibilityPolicy=1",
      "-sColorConversionStrategy=RGB",
      "-dEmbedAllFonts=true",
      "-dSubsetFonts=true",
      "-dCompressFonts=true",
      "-dNOSAFER",  // Allow reading ICC profiles
      `-sOutputFile=${outputPath}`,
      inputPath
    ], {
      timeout: 60000,
      encoding: "utf8"
    });

    if (gsCmd.error || gsCmd.status !== 0) {
      console.error("❌ Ghostscript error:", gsCmd.stderr);
      throw new Error(`Ghostscript PDF/A conversion failed: ${gsCmd.stderr}`);
    }

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      throw new Error("Ghostscript produced no output");
    }

    console.log("✅ Ghostscript PDF/A conversion successful");
    return fs.readFileSync(outputPath);

  } finally {
    // Cleanup
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      fs.rmdirSync(tmpDir);
    } catch (e) {
      console.warn("⚠️ Cleanup error:", e.message);
    }
  }
}

module.exports = {
  convertToPdfAWithGhostscript
};
```

### Workflow with Ghostscript

```javascript
const { embedZugferdXml } = require("../Helpers/pdf-helpers");
const { convertToPdfAWithGhostscript } = require("../Helpers/ghostscript-pdfa");
const { PDFDocument } = require("pdf-lib");

// 1. Generate PDF from Puppeteer
const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });

// 2. Embed ZUGFeRD XML first
const pdfDoc = await PDFDocument.load(pdfBuffer);
await embedZugferdXml(pdfDoc, invoiceData);
const pdfWithZugferd = Buffer.from(await pdfDoc.save());

// 3. Convert to PDF/A-3b with Ghostscript
const pdfA3bBuffer = convertToPdfAWithGhostscript(pdfWithZugferd, "3b");

return pdfA3bBuffer;
```

**Note:** Ghostscript may strip the ZUGFeRD XML, so test carefully. If this happens, embed XML **after** Ghostscript conversion.

---

## Solution 3: Hybrid Approach (MOST RELIABLE)

Combine Node.js embedding with Ghostscript validation.

### Workflow

```javascript
const { convertToPdfA3b } = require("../Helpers/pdfa-compliant");
const { convertToPdfAWithGhostscript } = require("../Helpers/ghostscript-pdfa");

// 1. Generate PDF
const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });

// 2. Add PDF/A-3b structure with Node.js
const semiCompliantPdf = await convertToPdfA3b(pdfBuffer, invoiceData);

// 3. Final pass with Ghostscript for validation
const fullyCompliantPdf = convertToPdfAWithGhostscript(semiCompliantPdf, "3b");

return fullyCompliantPdf;
```

---

## Solution 4: Use Existing Java/PDFBox (Current Implementation)

**If Java is already in Docker and working**, keep using it. The current implementation in `shopifyMerchantTemplate.js` is proven.

### What it does:
1. Generates PDF with Puppeteer
2. Runs Apache PDFBox Preflight to fix PDF/A issues
3. Embeds ZUGFeRD XML with `pdf-lib`
4. Validates with Ghostscript

### To use it elsewhere:

Extract the PDFBox logic into a reusable function:

```javascript
// app/server/Helpers/pdfbox-converter.js
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

function convertToPdfA3bWithPDFBox(pdfBuffer) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdfbox-"));
  const inputPath = path.join(tmpDir, "input.pdf");
  const outputPath = path.join(tmpDir, "output.pdf");

  try {
    fs.writeFileSync(inputPath, pdfBuffer);

    const pdfBoxCmd = spawnSync("java", [
      "-cp",
      [
        "./server/Helpers/preflight-app-2.0.24.jar",
        "./server/Helpers/pdfbox-3.0.6.jar",
        "./server/Helpers/pdfbox-io-3.0.6.jar",
        "./server/Helpers/preflight-3.0.6.jar",
        "./server/Helpers/fontbox-3.0.6.jar",
        "./server/Helpers/xmpbox-3.0.6.jar",
        "./server/Helpers/commons-logging-1.2.jar",
        "./server/Helpers/activation-1.1.1.jar"
      ].join(":"),
      "com.yourcompany.PdfA3bFixer",
      inputPath,
      outputPath
    ], {
      cwd: "/app",
      timeout: 60000,
      encoding: "utf8"
    });

    if (pdfBoxCmd.error || pdfBoxCmd.status !== 0) {
      throw new Error(`PDFBox failed: ${pdfBoxCmd.stderr}`);
    }

    return fs.readFileSync(outputPath);
  } finally {
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    fs.rmdirSync(tmpDir);
  }
}

module.exports = { convertToPdfA3bWithPDFBox };
```

---

## Validation

### Test with VeraPDF

```bash
# Install VeraPDF
wget https://software.verapdf.org/releases/verapdf-installer.zip
unzip verapdf-installer.zip
./verapdf-install

# Validate PDF
verapdf --flavour 3b --verbose invoice.pdf

# Expected output:
# PASS: PDF file is compliant with Validation Profile requirements.
```

### Test with Ghostscript

```bash
gs -dPDFA=3 -dBATCH -dNOPAUSE -sDEVICE=pdfwrite \
   -sOutputFile=/dev/null invoice.pdf

# Should complete without errors
```

---

## Recommended Approach

**For your situation (trouble with Java):**

### Use Solution 1 (Enhanced Node.js) + Solution 2 (Ghostscript)

**Why:**
- ✅ No Java required
- ✅ Ghostscript already in your Docker image
- ✅ Better control with `pdf-lib`
- ✅ Industry-standard Ghostscript validation
- ✅ Faster build times
- ✅ Smaller Docker image

**Implementation Steps:**

1. Create `app/server/Helpers/pdfa-compliant.js` (from Solution 1)
2. Create `app/server/Helpers/ghostscript-pdfa.js` (from Solution 2)
3. Update your invoice generation to use the hybrid approach
4. Test with VeraPDF
5. Once validated, remove Java from Dockerfile

**Expected result:**
- PDF/A-3b compliant documents
- ZUGFeRD XML embedded correctly
- VeraPDF validation passes
- No Java dependencies

---

## Next Steps

1. Choose your implementation approach
2. Implement the code
3. Test with a sample invoice
4. Validate with VeraPDF
5. Remove Python service (already done via script)
6. Remove Java (if using Node.js + Ghostscript solution)

Let me know which solution you'd like to implement, and I can provide more detailed code!
