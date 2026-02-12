#!/bin/bash
# Run PDF/A-3B Java Service
# Port: 8080

echo "Starting PDF/A-3B Service on port 8080..."
echo ""

if [ ! -f "target/pdfa-3b-service-1.0.0.jar" ]; then
    echo "ERROR: JAR not found! Please run build.sh first."
    exit 1
fi

java -jar target/pdfa-3b-service-1.0.0.jar
