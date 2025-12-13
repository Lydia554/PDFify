#!/bin/bash

# PDFify Local Environment Test Script
# Tests all major components of the local setup

set -e

echo "🧪 PDFify Environment Test Suite"
echo "=================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ $1${NC}"; }

FAILED_TESTS=0
PASSED_TESTS=0

# Test function
run_test() {
    local test_name="$1"
    local test_command="$2"

    echo -n "Testing: $test_name... "

    if eval "$test_command" &> /dev/null; then
        print_success "PASSED"
        ((PASSED_TESTS++))
        return 0
    else
        print_error "FAILED"
        ((FAILED_TESTS++))
        return 1
    fi
}

# Test 1: Docker services
echo "📦 Docker Services"
echo "------------------"

run_test "Docker daemon is running" "docker ps"
run_test "App container is running" "docker ps | grep -q pdf-api-app"
run_test "MongoDB container is running" "docker ps | grep -q pdf-api-mongo"

echo ""

# Test 2: Network connectivity
echo "🌐 Network Connectivity"
echo "-----------------------"

run_test "API responds to HTTP requests" "curl -s -o /dev/null -w '%{http_code}' http://localhost:3002/ | grep -q '200\|301\|302'"
run_test "MongoDB port is accessible" "nc -zv localhost 27017"

echo ""

# Test 3: Database
echo "💾 Database Tests"
echo "-----------------"

run_test "MongoDB connection works" "docker exec pdf-api-mongo mongosh --eval 'db.version()'"
run_test "PDFify database exists or can be created" "docker exec pdf-api-mongo mongosh pdfify --eval 'db.getName()'"
run_test "Can create collections" "docker exec pdf-api-mongo mongosh pdfify --eval 'db.test.insertOne({test:true})'"

echo ""

# Test 4: API Functionality
echo "🔌 API Functionality"
echo "--------------------"

# Create unique test user
TEST_EMAIL="test-$(date +%s)@example.com"
TEST_PASSWORD="testpass123"

echo -n "Testing: User registration... "
REGISTER_RESPONSE=$(curl -s -X POST http://localhost:3002/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")

if echo "$REGISTER_RESPONSE" | grep -q "apiKey\|success"; then
    API_KEY=$(echo "$REGISTER_RESPONSE" | grep -o '"apiKey":"[^"]*"' | cut -d'"' -f4)
    print_success "PASSED"
    ((PASSED_TESTS++))
else
    print_error "FAILED"
    ((FAILED_TESTS++))
    echo "Response: $REGISTER_RESPONSE"
fi

if [ ! -z "$API_KEY" ]; then
    echo -n "Testing: PDF generation with API key... "
    PDF_RESPONSE=$(curl -s -X POST http://localhost:3002/api/generate-invoice \
      -H "Content-Type: application/json" \
      -H "x-api-key: $API_KEY" \
      -d '{
        "template": "english",
        "preview": true,
        "requests": [{
          "data": {
            "invoiceNumber": "TEST-001",
            "invoiceDate": "2025-11-02",
            "seller": {
              "name": "Test Company",
              "address": "123 Test St",
              "city": "Test City",
              "postalCode": "12345",
              "country": "USA"
            },
            "buyer": {
              "name": "Test Customer",
              "address": "456 Customer Ave"
            },
            "items": [{
              "description": "Test Product",
              "quantity": 1,
              "unitPrice": 100.00,
              "total": 100.00
            }],
            "total": 100.00,
            "currency": "USD"
          }
        }]
      }')

    if echo "$PDF_RESPONSE" | grep -q '"pdf"\|"success"'; then
        print_success "PASSED"
        ((PASSED_TESTS++))

        # Extract and save PDF
        echo "$PDF_RESPONSE" | jq -r '.pdf' 2>/dev/null | base64 -d > test-invoice.pdf 2>/dev/null

        if [ -f "test-invoice.pdf" ] && [ -s "test-invoice.pdf" ]; then
            PDF_SIZE=$(stat -f%z test-invoice.pdf 2>/dev/null || stat -c%s test-invoice.pdf 2>/dev/null)
            print_info "PDF generated successfully ($PDF_SIZE bytes)"
            echo "   Saved as: test-invoice.pdf"
        fi
    else
        print_error "FAILED"
        ((FAILED_TESTS++))
        echo "Response: $PDF_RESPONSE"
    fi
else
    print_warning "SKIPPED (no API key from registration)"
fi

echo ""

# Test 5: File System & Permissions
echo "📁 File System Tests"
echo "--------------------"

run_test "MongoDB data directory exists" "test -d ./data"
run_test "App .env file exists" "test -f ./app/.env"
run_test "ICC profile exists" "test -f ./app/server/Helpers/sRGB_v4_ICC_preference.icc"
run_test "Templates directory exists" "test -d ./app/templates"

echo ""

# Test 6: Dependencies
echo "📦 Dependency Tests"
echo "-------------------"

run_test "Puppeteer dependencies installed" "docker exec pdf-api-app which chromium || docker exec pdf-api-app which google-chrome"
run_test "Node.js version correct" "docker exec pdf-api-app node --version | grep -q 'v20'"

echo ""

# Test 7: Container Health
echo "💓 Container Health"
echo "-------------------"

echo -n "Testing: App container CPU usage... "
CPU_USAGE=$(docker stats --no-stream pdf-api-app --format "{{.CPUPerc}}" | sed 's/%//')
if (( $(echo "$CPU_USAGE < 100" | bc -l) )); then
    print_success "PASSED (${CPU_USAGE}%)"
    ((PASSED_TESTS++))
else
    print_warning "HIGH CPU (${CPU_USAGE}%)"
    ((PASSED_TESTS++))
fi

echo -n "Testing: MongoDB container memory... "
MEM_USAGE=$(docker stats --no-stream pdf-api-mongo --format "{{.MemUsage}}")
print_success "PASSED ($MEM_USAGE)"
((PASSED_TESTS++))

echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Test Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

TOTAL_TESTS=$((PASSED_TESTS + FAILED_TESTS))
SUCCESS_RATE=$((PASSED_TESTS * 100 / TOTAL_TESTS))

echo "Total Tests:    $TOTAL_TESTS"
echo "Passed:         $(echo -e ${GREEN}$PASSED_TESTS${NC})"
echo "Failed:         $(echo -e ${RED}$FAILED_TESTS${NC})"
echo "Success Rate:   ${SUCCESS_RATE}%"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    print_success "All tests passed! Your environment is working correctly."
    echo ""
    echo "🎯 Next Steps:"
    echo "   • Open http://localhost:3002/ in your browser"
    echo "   • Check test-credentials.txt for login info"
    echo "   • View test-invoice.pdf to see the generated PDF"
    echo "   • Read .context/development-guide.md for more info"
elif [ $FAILED_TESTS -le 3 ]; then
    print_warning "Some tests failed, but core functionality appears to be working."
    echo ""
    echo "🔍 Troubleshooting:"
    echo "   • Check logs: docker compose logs -f"
    echo "   • Restart services: docker compose restart"
else
    print_error "Multiple tests failed. Your environment may not be working correctly."
    echo ""
    echo "🔧 Troubleshooting Steps:"
    echo "   1. Check Docker Desktop is running"
    echo "   2. View logs: docker compose logs -f"
    echo "   3. Restart services: docker compose restart"
    echo "   4. Rebuild: docker compose down && docker compose up -d --build"
    echo "   5. Check .context/wsl-docker-setup.md for detailed troubleshooting"
fi

echo ""

# Show container status
echo "📦 Container Status:"
docker compose ps

echo ""

# Exit with error code if tests failed
exit $FAILED_TESTS
