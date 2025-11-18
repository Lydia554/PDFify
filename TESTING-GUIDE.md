# Testing Guide - factur-x Python Service Integration

## Prerequisites

- Docker and Docker Compose installed
- WSL 2 (if on Windows)
- Access to PDFify repository

---

## Step 1: Build and Start Services

```bash
# Navigate to project directory
cd /home/user/PDFify

# Stop any running containers
docker compose down

# Build fresh images
docker compose build

# Start all services
docker compose up -d

# View logs
docker compose logs -f
```

**Expected output:**
```
python-service_1  | 🚀 Starting ZUGFeRD PDF/A-3b Generation Service
python-service_1  | Endpoints available:
python-service_1  |   - GET  /health
python-service_1  |   - POST /generate-zugferd
```

---

## Step 2: Test Python Service Health

```bash
# Check service health
curl http://localhost:5000/health

# Expected response:
{
  "status": "ok",
  "service": "zugferd-generator",
  "facturx_version": "3.x.x",
  "python_version": "3.11.x"
}
```

**If service is not accessible:**
```bash
# Check Python service logs
docker compose logs python-service

# Check if container is running
docker compose ps
```

---

## Step 3: Prepare Environment Variables

If you don't have an `.env` file:

```bash
# Copy example file
cp app/.env.example app/.env

# Edit the file and add at minimum:
# - MONGODB_URI
# - SESSION_SECRET
# - JWT_SECRET
# - ENCRYPTION_KEY
# - ZUGFERD_SERVICE_URL (defaults to http://python-service:5000)

# Restart services
docker compose restart app
```

---

## Step 4: Get API Key for Testing

### Option A: Use Existing Test User

If you ran `setup-local-env.sh`:

```bash
cat test-credentials.txt
```

### Option B: Create New Test User

```bash
# Access MongoDB
docker exec -it pdfify-mongo-1 mongosh pdfify

# Create user with pro plan
db.users.insertOne({
  email: "test-pro@example.com",
  password: "$2b$10$XxXxXxXxXxXxXxXxXxXxXx",  // Use bcrypt hash
  planType: "pro",
  apiKey: "test-api-key-123456789",
  maxUsage: 10000,
  usageCount: 0,
  isVerified: true,
  isActive: true,
  deleted: false
})

# Exit
exit
```

---

## Step 5: Generate Test Invoice (Compliant)

```bash
# Set your API key
export API_KEY="your_api_key_here"

# Generate compliant invoice
curl -X POST http://localhost:3002/api/generate-invoice \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "template": "english-pro-compliant",
    "compliant": true,
    "requests": [{
      "data": {
        "orderId": "TEST-001",
        "invoiceNumber": "INV-2025-001",
        "invoiceDate": "2025-11-18",
        "date": "20251118",
        "seller": {
          "name": "Test GmbH",
          "address": "Teststraße 123",
          "city": "Berlin",
          "postalCode": "10115",
          "country": "Germany",
          "taxId": "DE123456789",
          "email": "info@test-gmbh.de"
        },
        "buyer": {
          "name": "Customer AG",
          "address": "Kundenweg 456",
          "city": "Munich",
          "postalCode": "80331",
          "country": "Germany"
        },
        "items": [
          {
            "name": "Professional Services",
            "description": "Consulting Services - November 2025",
            "quantity": 10,
            "unitCode": "HUR",
            "price": 150.00,
            "tax": 285.00,
            "taxRate": 19.00,
            "total": 1785.00
          },
          {
            "name": "Software License",
            "description": "Annual License - Enterprise Plan",
            "quantity": 1,
            "unitCode": "EA",
            "price": 5000.00,
            "tax": 950.00,
            "taxRate": 19.00,
            "total": 5950.00
          }
        ],
        "subtotal": 6500.00,
        "taxAmount": 1235.00,
        "total": 7735.00,
        "currency": "EUR",
        "paymentTerms": "Net 30",
        "notes": "Thank you for your business!"
      },
      "compliant": true
    }]
  }' | jq -r '.pdf' | base64 -d > test-invoice-compliant.pdf
```

---

## Step 6: Check Logs

```bash
# Watch Node.js logs for factur-x integration
docker compose logs -f app | grep -E "(factur-x|ZUGFeRD|PDF/A)"

# Expected output:
[InvoiceRoute] 🔐 Generating PDF/A-3b compliant invoice for order: TEST-001
[InvoiceRoute] ✅ Generated ZUGFeRD XML (XXXX characters)
✅ ZUGFeRD service is healthy
   Service: zugferd-generator
   factur-x version: 3.x.x
✅ Using Python factur-x service for PDF/A-3b compliance
🔄 Calling ZUGFeRD service at http://python-service:5000/generate-zugferd for order: TEST-001
✅ ZUGFeRD PDF generated successfully for order: TEST-001
   Output size: XXXXX bytes
[InvoiceRoute] ✅ PDF/A-3b generation complete for order: TEST-001

# Watch Python service logs
docker compose logs -f python-service

# Expected output:
INFO - Processing ZUGFeRD generation for order: TEST-001
INFO - PDF file size: XXXXX bytes
INFO - XML content size: XXXX bytes
INFO - Generating PDF/A-3b with factur-x, level: EN16931
INFO - ✅ Successfully generated PDF/A-3b for order: TEST-001
INFO - Output PDF size: XXXXX bytes
```

---

## Step 7: Validate PDF/A-3b Compliance

### Option A: Using VeraPDF (Most Reliable)

```bash
# Install VeraPDF (if not installed)
wget https://software.verapdf.org/releases/verapdf-installer.zip
unzip verapdf-installer.zip
./verapdf-install

# Validate the PDF
verapdf --flavour 3b --verbose test-invoice-compliant.pdf

# Expected output:
<?xml version="1.0" encoding="UTF-8"?>
<report>
  <buildInformation>
    <releaseDetails id="core" version="1.x.x"/>
  </buildInformation>
  <jobs>
    <job>
      <item size="XXXXX">
        <name>test-invoice-compliant.pdf</name>
      </item>
      <validationReport profileName="PDF/A-3B" isCompliant="true">
        <details passedRules="XXX" failedRules="0" passedChecks="XXX" failedChecks="0"/>
      </validationReport>
    </job>
  </jobs>
  <batchSummary totalJobs="1" failedToParse="0" encrypted="0">
    <validationReports compliant="1" nonCompliant="0"/>
  </batchSummary>
</report>

# ✅ Look for: isCompliant="true"
```

### Option B: Using Ghostscript

```bash
# Validate with Ghostscript
docker exec pdfify-app-1 gs \
  -dPDFA=3 \
  -dBATCH \
  -dNOPAUSE \
  -sDEVICE=pdfwrite \
  -sOutputFile=/dev/null \
  /app/pdfs/test-invoice-compliant.pdf

# Should complete without errors
```

### Option C: Manual Inspection

```bash
# Use pdf-lib to inspect metadata
docker exec pdfify-app-1 node -e "
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

(async () => {
  const pdfBytes = fs.readFileSync('/app/pdfs/test-invoice-compliant.pdf');
  const pdfDoc = await PDFDocument.load(pdfBytes);

  console.log('Page count:', pdfDoc.getPageCount());
  console.log('Has embedded files:', pdfDoc.catalog.has('Names'));
  console.log('Has AF array:', pdfDoc.catalog.has('AF'));
  console.log('Has OutputIntents:', pdfDoc.catalog.has('OutputIntents'));
  console.log('Has Metadata:', pdfDoc.catalog.has('Metadata'));
})();
"

# Expected output:
Page count: X
Has embedded files: true
Has AF array: true
Has OutputIntents: true
Has Metadata: true
```

---

## Step 8: Extract and Validate ZUGFeRD XML

```bash
# Install pdfdetach (from poppler-utils)
sudo apt-get install poppler-utils

# List embedded files
pdfdetach -list test-invoice-compliant.pdf

# Expected output:
1 embedded files
  1: factur-x.xml

# Extract XML
pdfdetach -save 1 -o zugferd-extracted.xml test-invoice-compliant.pdf

# View XML
cat zugferd-extracted.xml

# Validate XML structure
xmllint --format zugferd-extracted.xml
```

---

## Step 9: Test Fallback Mechanism

Test that the fallback works when Python service is unavailable:

```bash
# Stop Python service
docker compose stop python-service

# Try to generate invoice (should use Node.js fallback)
curl -X POST http://localhost:3002/api/generate-invoice \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...same payload as before...}' \
  | jq -r '.pdf' | base64 -d > test-invoice-fallback.pdf

# Check logs - should show fallback message
docker compose logs app | grep "fallback"

# Expected output:
⚠️ ZUGFeRD service not available: connect ECONNREFUSED
⚠️ Python service unavailable, using Node.js fallback
⚠️ Using Node.js fallback for PDF/A-3b generation

# Restart Python service
docker compose start python-service
```

---

## Step 10: Performance Testing

```bash
# Time a compliant invoice generation
time curl -X POST http://localhost:3002/api/generate-invoice \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...payload...}' \
  -o /dev/null -s

# Expected: ~2-5 seconds total
# - Puppeteer PDF generation: ~1-2 seconds
# - factur-x processing: ~0.5-1 second
# - Network overhead: ~50-100ms
```

---

## Troubleshooting

### Python Service Won't Start

```bash
# Check Python service logs
docker compose logs python-service

# Common issues:
# 1. factur-x not installed
docker compose exec python-service pip list | grep factur-x

# 2. Flask not found
docker compose exec python-service pip list | grep Flask

# Rebuild Python service
docker compose build python-service
docker compose up -d python-service
```

### Connection Refused Error

```bash
# Check network connectivity
docker compose exec app ping python-service

# Check if Python service is listening
docker compose exec python-service netstat -tuln | grep 5000

# Check docker network
docker network inspect pdfify_pdf-api-network
```

### PDF Generation Fails

```bash
# Check full error trace
docker compose logs app | tail -100

# Check Python service errors
docker compose logs python-service | tail -100

# Common issues:
# 1. Missing invoice data fields
# 2. Invalid XML format
# 3. PDF buffer issues
```

---

## Success Criteria

✅ **All tests should pass:**

1. ✅ Python service health check returns OK
2. ✅ Node.js can connect to Python service
3. ✅ Invoice generation completes successfully
4. ✅ PDF is generated with embedded XML
5. ✅ VeraPDF validation passes (isCompliant="true")
6. ✅ ZUGFeRD XML can be extracted
7. ✅ Fallback mechanism works when Python service is down
8. ✅ Performance is acceptable (< 5 seconds)

---

## Next Steps After Successful Testing

1. **Update documentation** - Ensure all guides reflect new implementation
2. **Deploy to staging** - Test in staging environment
3. **Monitor logs** - Watch for any issues in staging
4. **Validate with real invoices** - Test with production-like data
5. **Deploy to production** - Roll out to production
6. **Remove Java dependencies** - Once confident, remove PDFBox/Java
7. **Monitor compliance** - Regular VeraPDF validation checks

---

## Rollback Plan

If issues occur:

```bash
# Revert to previous version
git checkout HEAD~1

# Rebuild and restart
docker compose down
docker compose build
docker compose up -d

# Or: Use Node.js fallback exclusively
# Set in docker-compose.yml:
environment:
  - ZUGFERD_SERVICE_URL=http://not-available:9999  # Force fallback
```

---

## Resources

- **VeraPDF:** https://verapdf.org/
- **factur-x Library:** https://github.com/akretion/factur-x
- **ZUGFeRD Specification:** https://www.ferd-net.de/standards/zugferd-2.1.1/
- **EN 16931 Standard:** https://ec.europa.eu/cefdigital/wiki/display/CEFDIGITAL/EN+16931

---

**Last Updated:** 2025-11-18
