#!/bin/bash

# Test script for Pro features

set -e

echo "🧪 PDFify Pro Feature Test"
echo "========================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Create unique test user
TEST_EMAIL="pro-test-$(date +%s)@example.com"
TEST_PASSWORD="testpass123"

echo "1. Registering a new user..."
REGISTER_RESPONSE=$(curl -s -X POST http://localhost:3002/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")

API_KEY=$(echo "$REGISTER_RESPONSE" | grep -o '"apiKey":"[^"”]*"' | cut -d'"' -f4)

if [ -z "$API_KEY" ]; then
    echo -e "${RED}Failed to register user or get API key.${NC}"
    exit 1
fi
echo -e "${GREEN}User registered successfully.${NC}"
echo "API Key: $API_KEY"

echo "2. Upgrading user to 'pro' plan..."
docker exec pdfify-mongo-1 mongosh pdfify --eval "db.users.updateOne({email: \"$TEST_EMAIL\"}, {\$set: {planType: 'pro'}}))"
echo -e "${GREEN}User plan updated to 'pro'.${NC}"

echo "3. Generating a compliant PDF..."
PDF_RESPONSE=$(curl -s -X POST http://localhost:3002/api/generate-invoice \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  --output pro-invoice.pdf \
  -d '{' \
    '"compliant"': true, \
    '"data"': { \
      '"invoiceNumber"': "PRO-TEST-001", \
      '"invoiceDate"': "2025-11-22", \
      '"seller"': { '"name"': "Pro Seller" }, \
      '"buyer"': { '"name"': "Pro Buyer" }, \
      '"items"': [{ '"description"': "Pro Item", '"quantity"': 1, '"unitPrice"': 100, '"total"': 100 }], \
      '"total"': 100, \
      '"currency"': "USD" \
    } \
  }')

if [ -f "pro-invoice.pdf" ] && [ -s "pro-invoice.pdf" ]; then
    echo -e "${GREEN}Compliant PDF generated successfully (pro-invoice.pdf).${NC}"
else
    echo -e "${RED}Failed to generate PDF.${NC}"
    exit 1
fi

echo "4. Validating PDF content for /ID tag..."
if grep -q "/ID" pro-invoice.pdf; then
    echo -e "${GREEN}Validation PASSED: /ID tag found in the PDF.${NC}"
else
    echo -e "${RED}Validation FAILED: /ID tag NOT found in the PDF.${NC}"
    exit 1
fi

echo "✅ Test finished successfully."
exit 0
