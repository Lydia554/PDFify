# PDFify - PDF/A-3b & ZUGFeRD Compliance Guide

## Overview

PDFify supports **PDF/A-3b** archival standard with embedded **ZUGFeRD 2.1.1** (EN16931) electronic invoices. This enables tax-compliant, machine-readable invoices for B2B transactions.

## What is PDF/A-3b?

**PDF/A-3b** is an ISO-standardized archival format (ISO 19005-3) that ensures:
- Long-term readability (10+ years)
- Visual reproducibility across systems
- Embedded file support (unlike PDF/A-1 and PDF/A-2)
- Self-contained documents (embedded fonts, color profiles)

### Key Requirements

1. **XMP Metadata**: Document metadata in standardized XML format
2. **ICC Color Profile**: Embedded sRGB color profile for consistent rendering
3. **Font Embedding**: All fonts must be embedded in the PDF
4. **No Encryption**: PDF/A cannot be password-protected
5. **No External References**: All resources must be embedded

## What is ZUGFeRD?

**ZUGFeRD** (Zentraler User Guide des Forums elektronische Rechnung Deutschland) is a German standard for hybrid invoices:
- **Human-readable**: Standard PDF invoice
- **Machine-readable**: Embedded XML with structured invoice data
- **Tax-compliant**: Accepted by German tax authorities

### Versions
- **ZUGFeRD 1.0**: Legacy (2014)
- **ZUGFeRD 2.0**: Aligned with EU EN16931 (2017)
- **ZUGFeRD 2.1.1**: Current version (2020) - **PDFify uses this**

### Conformance Levels
- **MINIMUM**: Basic invoice data
- **BASIC WL**: Basic without lines (total only)
- **BASIC**: Invoice with line items
- **EN16931**: EU standard - **PDFify default**
- **EXTENDED**: Full feature set

---

## Implementation in PDFify

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    PDF Generation Pipeline                    │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│ 1. Generate HTML from template (english-pro-compliant.js)    │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│ 2. Puppeteer: HTML → PDF (headless Chrome)                   │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│ 3. Embed XMP Metadata (pdf-lib)                              │
│    - PDF/A-3b identification                                  │
│    - ZUGFeRD conformance level                                │
│    - Document title, creator, date                            │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│ 4. Generate ZUGFeRD XML (xmlbuilder2)                        │
│    - Invoice data in EN16931 format                           │
│    - Tax breakdowns, line items, parties                      │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│ 5. Embed XML in PDF (Python factur-x service)                │
│    - POST to http://python-service:5000/embed-zugferd        │
│    - Attaches XML with proper relationship                    │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│ 6. Convert to PDF/A-3b (Ghostscript)                         │
│    - Embed sRGB ICC color profile                             │
│    - Validate PDF/A compliance                                │
│    - Output final compliant PDF                               │
└──────────────────────────────────────────────────────────────┘
```

---

## File Locations

| Component | File Path | Purpose |
|-----------|-----------|---------|
| PDF Helpers | [app/server/Helpers/pdf-helpers.js](app/server/Helpers/pdf-helpers.js) | Core compliance functions |
| ICC Profile | [app/server/Helpers/sRGB_v4_ICC_preference.icc](app/server/Helpers/sRGB_v4_ICC_preference.icc) | Color profile for PDF/A |
| Ghostscript Config | [app/server/routes/pdfa_def.ps](app/server/routes/pdfa_def.ps) | PDF/A definition file |
| Compliant Template | [app/templates/english-pro-compliant.js](app/templates/english-pro-compliant.js) | Tax-compliant invoice template |
| Python Service | [python-service/app.py](python-service/app.py) | ZUGFeRD embedding service |

---

## Step-by-Step Breakdown

### Step 1: XMP Metadata Embedding

**Function**: `embedXmp(pdfPath, metadata)`
**File**: [app/server/Helpers/pdf-helpers.js](app/server/Helpers/pdf-helpers.js)

**XMP Structure**:
```xml
<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:dc="http://purl.org/dc/elements/1.1/"
        xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"
        xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">

      <!-- PDF/A Identification -->
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>

      <!-- ZUGFeRD Identification -->
      <fx:ConformanceLevel>EN16931</fx:ConformanceLevel>
      <fx:DocumentFileName>zugferd-invoice.xml</fx:DocumentFileName>
      <fx:DocumentType>INVOICE</fx:DocumentType>
      <fx:Version>2.1</fx:Version>

      <!-- Document Metadata -->
      <dc:title>Invoice {{invoiceNumber}}</dc:title>
      <dc:creator>PDFify</dc:creator>
      <dc:date>{{currentDate}}</dc:date>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>
```

**Implementation**:
```javascript
const { PDFDocument } = require('pdf-lib');

async function embedXmp(pdfPath, metadata) {
  const pdfBytes = fs.readFileSync(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);

  const xmpXml = generateXmpXml(metadata);
  pdfDoc.catalog.set(
    PDFName.of('Metadata'),
    pdfDoc.context.stream(xmpXml, {
      Type: 'Metadata',
      Subtype: 'XML'
    })
  );

  const modifiedPdf = await pdfDoc.save();
  fs.writeFileSync(pdfPath, modifiedPdf);
}
```

---

### Step 2: ZUGFeRD XML Generation

**Function**: `generateZugferdXML(invoiceData)`
**File**: [app/server/Helpers/pdf-helpers.js](app/server/Helpers/pdf-helpers.js)

**XML Structure (EN16931)**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
    xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
    xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
    xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">

  <!-- Document Context -->
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>

  <!-- Invoice Header -->
  <rsm:ExchangedDocument>
    <ram:ID>INV-2025-001</ram:ID>
    <ram:TypeCode>380</ram:TypeCode> <!-- Commercial Invoice -->
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">20251102</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>

  <!-- Trade Transaction -->
  <rsm:SupplyChainTradeTransaction>

    <!-- Line Items -->
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>1</ram:LineID>
      </ram:AssociatedDocumentLineDocument>

      <ram:SpecifiedTradeProduct>
        <ram:Name>Product A</ram:Name>
      </ram:SpecifiedTradeProduct>

      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount>100.00</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>

      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="C62">2</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>

      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>S</ram:CategoryCode> <!-- Standard rate -->
          <ram:RateApplicablePercent>19.00</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>

        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>200.00</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>

    <!-- Seller (Supplier) -->
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>Company Ltd.</ram:Name>
        <ram:SpecifiedLegalOrganization>
          <ram:ID schemeID="0088">DE123456789</ram:ID> <!-- Tax ID -->
        </ram:SpecifiedLegalOrganization>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>12345</ram:PostcodeCode>
          <ram:LineOne>123 Street</ram:LineOne>
          <ram:CityName>City</ram:CityName>
          <ram:CountryID>DE</ram:CountryID>
        </ram:PostalTradeAddress>
        <ram:URIUniversalCommunication>
          <ram:URIID schemeID="EM">info@company.com</ram:URIID>
        </ram:URIUniversalCommunication>
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">DE123456789</ram:ID> <!-- VAT ID -->
        </ram:SpecifiedTaxRegistration>
      </ram:SellerTradeParty>

      <!-- Buyer -->
      <ram:BuyerTradeParty>
        <ram:Name>Customer GmbH</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>10115</ram:PostcodeCode>
          <ram:LineOne>456 Avenue</ram:LineOne>
          <ram:CityName>Berlin</ram:CityName>
          <ram:CountryID>DE</ram:CountryID>
        </ram:PostalTradeAddress>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>

    <!-- Monetary Totals -->
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>

      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>38.00</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:CategoryCode>S</ram:CategoryCode>
        <ram:BasisAmount>200.00</ram:BasisAmount>
        <ram:RateApplicablePercent>19.00</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>

      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>200.00</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>200.00</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">38.00</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>238.00</ram:GrandTotalAmount>
        <ram:DuePayableAmount>238.00</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>

  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
```

**Implementation**:
```javascript
const { create } = require('xmlbuilder2');

function generateZugferdXML(invoiceData) {
  const {
    invoiceNumber,
    invoiceDate,
    seller,
    buyer,
    items,
    subtotal,
    vatAmount,
    total,
    currency
  } = invoiceData;

  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('rsm:CrossIndustryInvoice', {
      'xmlns:rsm': 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
      'xmlns:ram': 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
      'xmlns:udt': 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100'
    });

  // Add context
  doc.ele('rsm:ExchangedDocumentContext')
     .ele('ram:GuidelineSpecifiedDocumentContextParameter')
       .ele('ram:ID').txt('urn:cen.eu:en16931:2017').up();

  // Add header
  const header = doc.ele('rsm:ExchangedDocument');
  header.ele('ram:ID').txt(invoiceNumber);
  header.ele('ram:TypeCode').txt('380'); // Commercial invoice
  header.ele('ram:IssueDateTime')
        .ele('udt:DateTimeString', { format: '102' })
        .txt(invoiceDate.replace(/-/g, ''));

  // Add trade transaction
  const trade = doc.ele('rsm:SupplyChainTradeTransaction');

  // Add line items
  items.forEach((item, index) => {
    const lineItem = trade.ele('ram:IncludedSupplyChainTradeLineItem');
    lineItem.ele('ram:AssociatedDocumentLineDocument')
            .ele('ram:LineID').txt(index + 1);
    // ... (add all item details)
  });

  // Add parties, totals, taxes
  // ... (full implementation)

  return doc.end({ prettyPrint: true });
}
```

---

### Step 3: XML Embedding (Python Service)

**File**: [python-service/app.py](python-service/app.py)

**Python Implementation**:
```python
from flask import Flask, request, send_file
from facturx import generate_from_file
import tempfile

app = Flask(__name__)

@app.route('/embed-zugferd', methods=['POST'])
def embed_zugferd():
    pdf_file = request.files['pdf']
    xml_content = request.form['xml']

    # Save uploaded PDF
    with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp_pdf:
        pdf_file.save(tmp_pdf.name)
        input_pdf = tmp_pdf.name

    # Create output file
    output_pdf = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf')

    # Embed ZUGFeRD XML using factur-x library
    generate_from_file(
        input_pdf,
        xml_content.encode('utf-8'),
        output_pdf_file=output_pdf.name,
        level='en16931'  # EN16931 conformance level
    )

    return send_file(output_pdf.name, mimetype='application/pdf')
```

**Node.js Call**:
```javascript
const FormData = require('form-data');
const axios = require('axios');

async function embedXmlIntoPdf(pdfPath, xmlContent) {
  const form = new FormData();
  form.append('pdf', fs.createReadStream(pdfPath));
  form.append('xml', xmlContent);

  const response = await axios.post(
    'http://python-service:5000/embed-zugferd',
    form,
    {
      headers: form.getHeaders(),
      responseType: 'arraybuffer'
    }
  );

  fs.writeFileSync(pdfPath, response.data);
}
```

---

### Step 4: PDF/A-3b Conversion (Ghostscript)

**Function**: `makePdfA3b(pdfPath, outputPath)`
**File**: [app/server/Helpers/pdf-helpers.js](app/server/Helpers/pdf-helpers.js)

**Ghostscript Command**:
```bash
gs \
  -dPDFA=3 \
  -dBATCH \
  -dNOPAUSE \
  -sColorConversionStrategy=sRGB \
  -sProcessColorModel=DeviceRGB \
  -sDEVICE=pdfwrite \
  -dPDFACompatibilityPolicy=1 \
  -sOutputFile=output.pdf \
  input.pdf \
  -c "[ /ICCBased /DeviceRGB /Info << /Title (sRGB IEC61966-2.1) >> currentdict end ] /DefaultRGB exch /ColorSpace defineresource pop" \
  -f
```

**Implementation**:
```javascript
const { execSync } = require('child_process');
const path = require('path');

function makePdfA3b(inputPath, outputPath) {
  const iccProfile = process.env.PDFA_ICC_PROFILE ||
                     './server/Helpers/sRGB_v4_ICC_preference.icc';

  const command = `gs \
    -dPDFA=3 \
    -dBATCH \
    -dNOPAUSE \
    -dNOSAFER \
    -sColorConversionStrategy=sRGB \
    -sProcessColorModel=DeviceRGB \
    -sDEVICE=pdfwrite \
    -dPDFACompatibilityPolicy=1 \
    -sOutputFile="${outputPath}" \
    "${inputPath}"`;

  try {
    execSync(command, { stdio: 'inherit' });
    console.log('✓ PDF/A-3b conversion successful');
    return true;
  } catch (error) {
    console.error('✗ PDF/A-3b conversion failed:', error.message);
    throw error;
  }
}
```

---

## Validation

### Manual Validation

**Using Ghostscript**:
```bash
gs -dNODISPLAY -dBATCH -dNOPAUSE -sOutputFile=/dev/null invoice.pdf
```

**Expected Output**:
```
GPL Ghostscript 10.0.0 (2022-09-21)
Copyright (C) 2022 Artifex Software, Inc.  All rights reserved.
Processing pages 1 through 1.
Page 1
✓ No errors or warnings
```

**Using VeraPDF** (recommended):
```bash
docker run --rm -v $(pwd):/pdfs verapdf/verapdf /pdfs/invoice.pdf

# Expected:
# Validation: PASSED
# Profile: PDF/A-3b
```

### Automated Validation in Code

**File**: [app/server/routes/invoiceRoutes.js](app/server/routes/invoiceRoutes.js)

```javascript
function validatePdfA3b(pdfPath) {
  try {
    // Check for XMP metadata
    const pdfBytes = fs.readFileSync(pdfPath);
    if (!pdfBytes.includes('pdfaid:part>3')) {
      throw new Error('Missing PDF/A-3 identifier in XMP');
    }

    // Check for ZUGFeRD attachment
    if (!pdfBytes.includes('zugferd-invoice.xml')) {
      throw new Error('Missing ZUGFeRD XML attachment');
    }

    // Run Ghostscript validation
    execSync(`gs -dNODISPLAY -dBATCH -dNOPAUSE -sOutputFile=/dev/null "${pdfPath}"`);

    return true;
  } catch (error) {
    console.error('PDF/A-3b validation failed:', error.message);
    return false;
  }
}
```

---

## Troubleshooting

### Common Issues

**1. XMP Metadata Not Found**
```
Error: PDF/A identifier missing
```

**Solution**: Ensure `embedXmp()` is called before Ghostscript conversion.

**2. Ghostscript Fails with "Undefined in --run--"**
```
Error: /undefined in --run--
```

**Solution**: Check ICC profile path and Ghostscript version (10.0+).

**3. ZUGFeRD XML Not Attached**
```
Error: XML attachment missing
```

**Solution**: Verify Python service is running:
```bash
docker compose ps python-service
curl http://localhost:5000/health
```

**4. Font Embedding Errors**
```
Error: Could not find/open font
```

**Solution**: Ensure fonts are available in Docker container:
```dockerfile
RUN apt-get install -y fonts-liberation fonts-dejavu
```

**5. Color Profile Issues**
```
Error: ColorSpace not defined
```

**Solution**: Verify ICC profile exists and is readable:
```bash
ls -la app/server/Helpers/*.icc
```

---

## Testing Compliance

### Test Invoice Generation

```bash
curl -X POST http://localhost:3002/api/generate-invoice \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "template": "english-pro-compliant",
    "compliant": true,
    "requests": [{
      "data": {
        "invoiceNumber": "TEST-COMPLIANT-001",
        "invoiceDate": "2025-11-02",
        "seller": {
          "name": "Test Seller GmbH",
          "address": "Test Street 123",
          "city": "Berlin",
          "postalCode": "10115",
          "country": "Germany",
          "taxId": "DE123456789",
          "email": "seller@test.com"
        },
        "buyer": {
          "name": "Test Buyer Ltd.",
          "address": "Buyer Ave 456",
          "city": "Hamburg",
          "postalCode": "20095",
          "country": "Germany"
        },
        "items": [{
          "description": "Professional Services",
          "quantity": 10,
          "unitPrice": 100.00,
          "vatRate": 19,
          "total": 1000.00
        }],
        "subtotal": 1000.00,
        "vatAmount": 190.00,
        "total": 1190.00,
        "currency": "EUR"
      }
    }]
  }' | jq -r '.pdf' | base64 -d > compliant-invoice.pdf
```

### Extract and Verify ZUGFeRD XML

```bash
# Using pdftk
pdftk compliant-invoice.pdf unpack_files output ./extracted/

# Or using pdf-lib (Node.js)
node -e "
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

(async () => {
  const pdf = await PDFDocument.load(fs.readFileSync('compliant-invoice.pdf'));
  const attachments = pdf.catalog.get(PDFName.of('Names'))
                                 .get(PDFName.of('EmbeddedFiles'));
  // Extract XML
})();
"
```

---

## Compliance Checklist

Before marking invoice as compliant:

- [ ] XMP metadata includes `pdfaid:part=3` and `pdfaid:conformance=B`
- [ ] XMP metadata includes `fx:ConformanceLevel=EN16931`
- [ ] ZUGFeRD XML attached with filename `zugferd-invoice.xml`
- [ ] XML validates against EN16931 schema
- [ ] ICC color profile embedded (sRGB)
- [ ] All fonts embedded
- [ ] No encryption applied
- [ ] Ghostscript validation passes
- [ ] File extension is `.pdf` (not `.pdfa`)

---

## Reference Documents

### Standards
- **ISO 19005-3:2012** - PDF/A-3 specification
- **EN 16931-1:2017** - European e-invoicing standard
- **ZUGFeRD 2.1.1** - German e-invoice standard

### Tools
- **VeraPDF**: https://verapdf.org/ (PDF/A validator)
- **factur-x**: https://github.com/akretion/factur-x (Python library)
- **Ghostscript**: https://www.ghostscript.com/

### PDFify Resources
- XMP Helper: [app/server/Helpers/pdf-helpers.js:embedXmp](app/server/Helpers/pdf-helpers.js)
- ZUGFeRD Generator: [app/server/Helpers/pdf-helpers.js:generateZugferdXML](app/server/Helpers/pdf-helpers.js)
- Compliant Template: [app/templates/english-pro-compliant.js](app/templates/english-pro-compliant.js)
