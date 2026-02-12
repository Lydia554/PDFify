# PDF/A-3B Java Service

## Overview

This Java service creates PDF/A-3b compliant invoices using Apache PDFBox 3.0.3 with Java 21.

## Structure

```
java/
├── pom.xml                          # Maven build configuration
├── sRGB.icc                         # ICC color profile for PDF/A
├── build.bat                         # Windows build script
├── build.sh                          # Linux/Mac build script
├── run.bat                           # Windows run script
├── run.sh                            # Linux/Mac run script
└── src/main/java/com/pdfa/
    ├── CreatePDFA3B.java           # Standalone PDF/A-3b creator
    └── PDFA3BService.java           # Service wrapper
```

## Requirements

- **Java**: 21 (OpenJDK or Oracle)
- **Maven**: 3.6+
- **PDFBox**: 3.0.3 (managed by Maven)

## Quick Start

### Build
```bash
# Windows
build.bat

# Linux/Mac
chmod +x build.sh
./build.sh
```

### Run Standalone
```bash
# Windows
java -cp target/pdfa-3b-service-1.0.0.jar com.pdfa.CreatePDFA3B

# Linux/Mac
java -cp target/pdfa-3b-service-1.0.0.jar com.pdfa.CreatePDFA3B
```

### Run as Service
```bash
# Start HTTP service on port 8080
java -jar target/pdfa-3b-service-1.0.0.jar

# Or use scripts
# Windows
run.bat

# Linux/Mac
chmod +x run.sh
./run.sh
```

## Maven Commands

```bash
# Clean build
mvn clean package

# Skip tests
mvn clean package -DskipTests

# Specific Java version
mvn clean package -Dmaven.compiler.source=21 -Dmaven.compiler.target=21
```

## Output

- **PDF File**: `invoice-pdfa3b.pdf`
- **Validation**: Use veraPDF to validate PDF/A-3b compliance
- **Compliance**: ISO 19005-3:2012 (PDF/A-3b)

## Features

✅ PDF/A-3b compliance
✅ XMP metadata
✅ ICC color profile (sRGB)
✅ ZUGFeRD XML embedding
✅ Apache PDFBox 3.0.3
✅ Java 21 compatible

## Integration with Docker

To use in Docker:

### Option 1: Build in Docker
Add to Dockerfile:
```dockerfile
# Copy Java service
COPY java /tmp/java
RUN cd /tmp/java && mvn package && \
    cp target/pdfa-3b-service-1.0.0.jar /usr/local/bin/
```

### Option 2: Pre-built JAR
```dockerfile
COPY java/target/pdfa-3b-service-1.0.0.jar /usr/local/bin/pdfa-service.jar
```

## Troubleshooting

### Build Failures
- **Java Version**: Ensure Java 21 is active: `java -version`
- **Maven Cache**: Clear with: `mvn clean`
- **Dependency Issues**: Delete `~/.m2/repository` and rebuild

### Runtime Errors
- **ClassNotFound**: Rebuild JAR with dependencies
- **ICC Profile**: Ensure `sRGB.icc` is accessible
- **Font Issues**: Check PDFBox font loading

### Version Conflicts
- **Java 8 vs 21**: Update JAVA_HOME to point to Java 21
- **PDFBox Version**: Using 3.0.3 (requires Java 11+, recommended Java 21)

## API Usage (Service Mode)

If running as HTTP service:

```bash
# Create PDF/A-3b
curl -X POST http://localhost:8080/create \
  -H "Content-Type: application/json" \
  -d '{"orderId": "INV-001", "customer": "Test Customer"}'

# Returns PDF file
```

## Testing

```bash
# Test PDF/A-3b compliance with veraPDF
verapdf --flavour 3b invoice-pdfa3b.pdf

# Expected output:
# compliant="true"
# profileName="PDF/A-3B validation profile"
```

## Files

- **CreatePDFA3B.java**: Standalone main class for testing
- **PDFA3BService.java**: REST service wrapper
- **pom.xml**: Maven configuration with PDFBox 3.0.3
- **sRGB.icc**: ICC color profile for PDF/A compliance

## References

- [Apache PDFBox](https://pdfbox.apache.org/)
- [PDF/A Standard](https://www.iso.org/standard/70969.html)
- [veraPDF Validator](https://verapdf.org/)
- [ZUGFeRD](https://www.ferd-netzwerk.de/)

---

**Status**: ✅ Java 21 + PDFBox 3.0.3 configured
