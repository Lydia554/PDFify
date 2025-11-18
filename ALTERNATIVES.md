# Python Service & Java Alternatives for PDFify

## Current Architecture Analysis

### Python Service (`python-service/`)
**Status:** ❌ **NOT USED** - Can be safely removed

**Why it exists:**
- Originally intended for ZUGFeRD XML embedding using `factur-x` library
- Single endpoint: `/generate-zugferd` (POST)

**Why it's not needed:**
- ZUGFeRD XML is already generated in Node.js (`app/xml/generateZugferdXml.js`)
- ZUGFeRD embedding is done in Node.js (`app/server/Helpers/pdf-helpers.js`)
- No code calls the Python service

### Java/PDFBox (`app/server/Helpers/*.jar`)
**Status:** ✅ **IN USE** (but optional)

**Where it's used:**
- File: `app/server/routes/shopify/shopifyMerchantTemplate.js:107-193`
- Purpose: PDF/A-3b compliance validation and fixing using Apache PDFBox Preflight

**Why it might be problematic:**
- Requires Java 17+ runtime in Docker container
- Increases image size (~200MB+)
- Compilation step needed for `PdfA3bFixer.java`
- Slow execution (spawning Java process)

---

## Option 1: Remove Python Service (RECOMMENDED ✅)

**Immediate action - Zero risk:**

### Step 1: Update `docker-compose.yml`

```yaml
version: "3.9"
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    image: pdf-api
    ports:
      - "3002:3000"
    env_file:
      - .env
    environment:
      PUPPETEER_SKIP_DOWNLOAD: "true"
    cap_add:
      - SYS_ADMIN
    depends_on:
      - mongo
    networks:
      - pdf-api-network

  mongo:
    image: mongo:5.0
    container_name: pdf-api-mongo
    volumes:
      - mongo-data:/data/db
    networks:
      - pdf-api-network

volumes:
  mongo-data:

networks:
  pdf-api-network:
    driver: bridge
```

**Changes:**
- Remove `python-service` service definition
- Remove `depends_on: python-service` from app service

### Step 2: (Optional) Remove Python service directory

```bash
# Archive for backup
tar -czf python-service-backup.tar.gz python-service/

# Remove directory
rm -rf python-service/
```

**Benefits:**
- Faster startup (one less container)
- Simpler architecture
- Reduced maintenance
- No Python dependencies to manage

**Risk:** ⚠️ None - service is not being called

---

## Option 2: Remove Java/PDFBox Dependencies (MEDIUM EFFORT)

**For removing Java entirely from the Node.js container:**

### Current Java Usage

Java is only used in `shopifyMerchantTemplate.js` for PDF/A-3b compliance:

```javascript
const pdfBoxCmd = spawnSync(
  "java",
  [
    "-cp",
    "./server/Helpers/preflight-app-2.0.24.jar:...", // All JAR files
    "com.yourcompany.PdfA3bFixer",
    tmpInput,
    tmpPdfBoxOutput
  ],
  { cwd: "/app", timeout: 60000 }
);
```

### Alternative 1: Pure Node.js PDF/A Compliance

**Use existing Node.js implementation:**

The codebase already has `finalizePdf()` in `pdf-helpers.js` that:
- Embeds XMP metadata for PDF/A-3b identification
- Adds ZUGFeRD XML
- Sets PDF/A catalog entries

**Modification:**

```javascript
// In shopifyMerchantTemplate.js
// REPLACE lines 107-193 (PDFBox section) with:

const { finalizePdf } = require("../../Helpers/pdf-helpers");

// After generating PDF with Puppeteer:
const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });

// Finalize with PDF/A-3b compliance
const compliantPdfBuffer = await finalizePdf(pdfBuffer, invoiceData);

// Continue with Ghostscript validation...
```

**Benefits:**
- ✅ No Java required
- ✅ Faster execution (no process spawning)
- ✅ Smaller Docker image (~200MB saved)
- ✅ Simpler build process

**Limitations:**
- ⚠️ May not pass strict VeraPDF validation
- ⚠️ PDFBox does additional font embedding fixes
- ⚠️ Less battle-tested for compliance

### Alternative 2: Node.js PDF/A Library

**Use `pdf-lib` with enhanced PDF/A support:**

```bash
npm install pdf-lib @pdf-lib/fontkit
```

**Enhanced implementation:**

```javascript
const { PDFDocument, StandardFonts, PDFName, PDFHexString } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const fs = require("fs");

async function convertToPdfA3b(inputPdfBuffer, invoiceData) {
  const pdfDoc = await PDFDocument.load(inputPdfBuffer);
  pdfDoc.registerFontkit(fontkit);

  // 1. Embed ICC color profile
  const iccProfilePath = path.join(__dirname, "sRGB2014.icc");
  const iccProfileBytes = fs.readFileSync(iccProfilePath);

  const iccStream = pdfDoc.context.flateStream(iccProfileBytes, {
    N: 3, // RGB
    Alternate: PDFName.of("DeviceRGB")
  });
  const iccRef = pdfDoc.context.register(iccStream);

  // 2. Set OutputIntent for PDF/A-3b
  const outputIntent = pdfDoc.context.obj({
    Type: PDFName.of("OutputIntent"),
    S: PDFName.of("GTS_PDFA1"),
    OutputConditionIdentifier: PDFHexString.fromText("sRGB IEC61966-2.1"),
    DestOutputProfile: iccRef
  });

  pdfDoc.catalog.set(
    PDFName.of("OutputIntents"),
    pdfDoc.context.obj([outputIntent])
  );

  // 3. Add XMP metadata
  const xmp = generatePdfA3bXmp(invoiceData);
  const metadataStream = pdfDoc.context.flateStream(Buffer.from(xmp, 'utf8'), {
    Type: PDFName.of('Metadata'),
    Subtype: PDFName.of('XML')
  });
  const metadataRef = pdfDoc.context.register(metadataStream);
  pdfDoc.catalog.set(PDFName.of('Metadata'), metadataRef);

  // 4. Mark as tagged PDF
  pdfDoc.catalog.set(PDFName.of('MarkInfo'), pdfDoc.context.obj({ Marked: true }));

  // 5. Embed ZUGFeRD XML
  await embedZugferdXml(pdfDoc, invoiceData);

  // 6. Embed all fonts as subsets
  const pages = pdfDoc.getPages();
  for (const page of pages) {
    const { Font } = page.node.Resources();
    if (Font) {
      // Fonts are already embedded by Puppeteer
      // Ensure they're marked as embedded
    }
  }

  return await pdfDoc.save();
}

function generatePdfA3bXmp(invoiceData) {
  return `<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?>
<x:xmpmeta xmlns:x='adobe:ns:meta/'>
  <rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>
    <rdf:Description rdf:about=''
        xmlns:dc='http://purl.org/dc/elements/1.1/'>
      <dc:format>application/pdf</dc:format>
      <dc:title>
        <rdf:Alt>
          <rdf:li xml:lang='x-default'>Invoice ${invoiceData.orderId}</rdf:li>
        </rdf:Alt>
      </dc:title>
    </rdf:Description>
    <rdf:Description rdf:about=''
        xmlns:pdfaid='http://www.aiim.org/pdfa/ns/id/'>
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
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
          </rdf:li>
        </rdf:Bag>
      </pdfaExtension:schemas>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end='w'?>`;
}
```

**Benefits:**
- ✅ No Java required
- ✅ More control over PDF structure
- ✅ Better integration with existing code
- ✅ Actively maintained library

**Effort:** Medium (2-3 hours implementation)

### Alternative 3: Ghostscript-Only Validation

**Keep Ghostscript, remove PDFBox:**

Ghostscript can also convert to PDF/A-3b:

```bash
gs \
  -dPDFA=3 \
  -dBATCH \
  -dNOPAUSE \
  -sColorConversionStrategy=RGB \
  -sDEVICE=pdfwrite \
  -dPDFACompatibilityPolicy=1 \
  -sOutputFile=output.pdf \
  input.pdf
```

**Node.js implementation:**

```javascript
const { spawnSync } = require("child_process");

function convertToPdfA3bWithGhostscript(inputPath, outputPath) {
  const gsCmd = spawnSync("gs", [
    "-dPDFA=3",
    "-dBATCH",
    "-dNOPAUSE",
    "-sColorConversionStrategy=RGB",
    "-sDEVICE=pdfwrite",
    "-dPDFACompatibilityPolicy=1",
    "-dEmbedAllFonts=true",
    "-dSubsetFonts=true",
    "-dCompressFonts=true",
    "-sOutputFile=" + outputPath,
    inputPath
  ], { timeout: 60000 });

  if (gsCmd.error || gsCmd.status !== 0) {
    throw new Error(`Ghostscript conversion failed: ${gsCmd.stderr}`);
  }

  return fs.readFileSync(outputPath);
}
```

**Benefits:**
- ✅ No Java required
- ✅ Ghostscript already in Docker image
- ✅ Industry-standard tool
- ✅ Good compliance rates

**Limitations:**
- ⚠️ Less control over output
- ⚠️ May modify fonts/colors
- ⚠️ Process spawning overhead

### Alternative 4: External PDF/A Service

**Use cloud service for compliance:**

**Option A: DocRaptor** (https://docraptor.com)
```javascript
const DocRaptor = require("docraptor");

docraptor.createDoc({
  test: true,
  document_content: htmlContent,
  type: "pdf",
  pdf_a: true,  // PDF/A-3b
  prince_options: {
    pdf_profile: "PDF/A-3b"
  }
});
```

**Option B: PDF/A Converter API** (https://www.pdfa.org)
```javascript
const axios = require("axios");
const FormData = require("form-data");

const form = new FormData();
form.append("file", pdfBuffer, "invoice.pdf");
form.append("conformance", "3b");

const response = await axios.post(
  "https://api.pdfa-converter.com/v1/convert",
  form,
  { headers: form.getHeaders() }
);
```

**Benefits:**
- ✅ No Java required
- ✅ Professional compliance
- ✅ VeraPDF validated
- ✅ No maintenance

**Limitations:**
- ⚠️ Cost per conversion
- ⚠️ External dependency
- ⚠️ Network latency
- ⚠️ Data privacy concerns

---

## Option 3: Keep Java but Optimize (LOW EFFORT)

**If you want to keep Java but reduce issues:**

### Use Alpine-based Java

**Update Dockerfile:**

```dockerfile
FROM node:20-alpine

# Install Java 17 + Ghostscript
RUN apk add --no-cache \
    openjdk17-jre \
    ghostscript \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Set Java home
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk
ENV PATH="$JAVA_HOME/bin:${PATH}"

# ... rest of Dockerfile
```

**Benefits:**
- ✅ Smaller image size (~150MB vs 400MB)
- ✅ Faster build times
- ✅ Alpine is more secure
- ✅ Same functionality

**Effort:** Low (30 minutes)

### Pre-compile Java Class

**Current issue:** Java class is compiled during Docker build

**Solution:** Pre-compile and include `.class` file

```bash
# On your local machine
javac \
  -cp "./app/server/Helpers/pdfbox-3.0.6.jar:./app/server/Helpers/preflight-3.0.6.jar" \
  ./app/server/Helpers/com/yourcompany/PdfA3bFixer.java

# Add .class file to repo
git add app/server/Helpers/com/yourcompany/PdfA3bFixer.class
```

**Update Dockerfile:**

```dockerfile
# Remove javac compilation step
# Just copy the .class file
COPY ./app/server/Helpers/ ./server/Helpers/
```

**Benefits:**
- ✅ Faster Docker builds
- ✅ No `javac` needed (only JRE)
- ✅ Smaller image
- ✅ More reliable builds

---

## Recommended Migration Path

### Phase 1: Remove Python Service (Immediate)

```bash
# 1. Update docker-compose.yml (remove python-service)
# 2. Restart services
docker compose down
docker compose up -d --build

# 3. Test PDF generation
curl -X POST http://localhost:3002/api/generate-invoice \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"template":"english-pro-compliant","compliant":true,...}'

# 4. Archive Python service
tar -czf python-service-backup.tar.gz python-service/
rm -rf python-service/
```

**Time:** 10 minutes
**Risk:** None (not being used)

### Phase 2: Test Without PDFBox (Optional)

```bash
# 1. Comment out PDFBox code in shopifyMerchantTemplate.js
# 2. Use finalizePdf() from pdf-helpers.js instead
# 3. Test Shopify merchant invoices
# 4. Validate with VeraPDF

# If validation passes:
# 5. Remove Java from Dockerfile
# 6. Remove JAR files
```

**Time:** 2-3 hours
**Risk:** Medium (may affect PDF/A compliance)

### Phase 3: Optimize (If Keeping Java)

```bash
# 1. Switch to Alpine-based image
# 2. Pre-compile Java classes
# 3. Test thoroughly
```

**Time:** 1 hour
**Risk:** Low

---

## Summary

| Solution | Effort | Image Size | Risk | Compliance |
|----------|--------|------------|------|------------|
| **Remove Python** | 10 min | Same | None | No impact |
| **Remove Java + use pdf-lib** | 3 hours | -200MB | Medium | Good |
| **Remove Java + use Ghostscript** | 2 hours | -150MB | Low | Good |
| **Remove Java + use cloud service** | 4 hours | -200MB | Low | Excellent |
| **Keep Java, optimize Alpine** | 1 hour | -150MB | Low | Excellent |
| **Keep both as-is** | 0 min | Same | None | Excellent |

## My Recommendation

**Immediate action:**
1. ✅ **Remove Python service** (10 minutes, zero risk)

**Short-term:**
2. ✅ **Test existing `finalizePdf()` for PDF/A compliance**
   - If it passes VeraPDF validation, remove Java
   - If not, keep Java but optimize with Alpine

**Long-term:**
3. Consider migrating to pure Node.js PDF/A solution using enhanced `pdf-lib` implementation

---

## Testing Compliance

**After any changes, validate with VeraPDF:**

```bash
# Install VeraPDF
wget https://software.verapdf.org/releases/verapdf-installer.zip
unzip verapdf-installer.zip
./verapdf-install

# Validate PDF
verapdf --flavour 3b invoice.pdf

# Expected output:
# PASS: invoice.pdf is compliant with PDF/A-3b
```

**Or use online validator:**
- https://www.pdfa.org/pdfa-validator/
- Upload PDF, select "PDF/A-3b", validate

---

## Questions?

Check the implementation files:
- Current ZUGFeRD: `app/xml/generateZugferdXml.js`
- Current embedding: `app/server/Helpers/pdf-helpers.js`
- Java usage: `app/server/routes/shopify/shopifyMerchantTemplate.js:107-193`
