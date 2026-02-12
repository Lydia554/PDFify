#!/bin/bash
# Build PDF/A-3B Java Service with Maven
# Requires: Maven 3.x and Java 21

echo "========================================"
echo "Building PDF/A-3B Java Service"
echo "========================================"
echo ""

# Check Maven
if ! command -v mvn &> /dev/null; then
    echo "ERROR: Maven not found! Please install Maven first."
    echo "Download from: https://maven.apache.org/download.cgi"
    exit 1
fi

# Check Java
if ! command -v java &> /dev/null; then
    echo "ERROR: Java not found! Please install Java 21."
    echo "Download from: https://www.oracle.com/java/technologies/downloads/"
    exit 1
fi

# Build with Maven
echo "Building with Maven..."
mvn clean package

if [ $? -eq 0 ]; then
    echo ""
    echo "========================================"
    echo "Build SUCCESS!"
    echo "========================================"
    echo "JAR location: target/pdfa-3b-service-1.0.0.jar"
    echo ""
    echo "To run: java -jar target/pdfa-3b-service-1.0.0.jar"
else
    echo ""
    echo "========================================"
    echo "Build FAILED!"
    echo "========================================"
    exit 1
fi
