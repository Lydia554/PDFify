#!/bin/bash

# PDFify Local Environment Setup Script for WSL
# This script automates the setup of your local testing environment

set -e  # Exit on error

echo "🚀 PDFify Local Environment Setup"
echo "===================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Step 1: Check prerequisites
echo "📋 Step 1: Checking prerequisites..."
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed or not in PATH"
    echo "Please install Docker Desktop and enable WSL integration"
    exit 1
fi
print_success "Docker is installed"

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed"
    exit 1
fi
print_success "Docker Compose is installed"

# Check if Docker daemon is running
if ! docker ps &> /dev/null; then
    print_error "Docker daemon is not running"
    echo "Please start Docker Desktop"
    exit 1
fi
print_success "Docker daemon is running"

# Check if Node.js is available (for key generation)
if ! command -v node &> /dev/null; then
    print_warning "Node.js not found locally (will use Docker container)"
    USE_DOCKER_FOR_NODE=true
else
    print_success "Node.js is installed"
    USE_DOCKER_FOR_NODE=false
fi

echo ""

# Step 2: Check if .env file exists
echo "📝 Step 2: Setting up environment variables..."
echo ""

ENV_FILE="app/.env"

if [ -f "$ENV_FILE" ]; then
    print_warning ".env file already exists"
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_success "Keeping existing .env file"
        SKIP_ENV=true
    else
        SKIP_ENV=false
    fi
else
    SKIP_ENV=false
fi

if [ "$SKIP_ENV" = false ]; then
    # Generate secure keys
    echo "Generating secure keys..."

    if [ "$USE_DOCKER_FOR_NODE" = true ]; then
        print_warning "Using Docker to generate keys..."
        SESSION_SECRET=$(docker run --rm node:20-slim node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
        JWT_SECRET=$(docker run --rm node:20-slim node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
        ENCRYPTION_KEY=$(docker run --rm node:20-slim node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")
    else
        SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
        JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
        ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")
    fi

    # Create .env file
    cat > "$ENV_FILE" << EOF
# Database Configuration
MONGODB_URI=mongodb://mongo:27017/pdfify

# Security Keys (auto-generated)
SESSION_SECRET=$SESSION_SECRET
JWT_SECRET=$JWT_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY

# Stripe Keys (use test keys from https://dashboard.stripe.com/test/apikeys)
STRIPE_SECRET_KEY=sk_test_your_test_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_test_publishable_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# PDF/A Configuration
PDFA_ICC_PROFILE=./server/Helpers/sRGB_v4_ICC_preference.icc

# Application URLs
SUCCESS_URL=http://localhost:3000/success
CANCEL_URL=http://localhost:3000/cancel

# Development Settings
NODE_ENV=development
DEBUG_MODE=true
FORCE_PLAN=pro

# Email Configuration (optional for local testing)
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=your-email@gmail.com
# SMTP_PASS=your-app-password
EOF

    print_success ".env file created with secure keys"
    print_warning "Don't forget to add your Stripe test keys to app/.env"
fi

echo ""

# Step 3: Create data directory for MongoDB
echo "📁 Step 3: Creating data directory..."
echo ""

if [ ! -d "data" ]; then
    mkdir -p data
    print_success "Created data directory for MongoDB"
else
    print_success "Data directory already exists"
fi

echo ""

# Step 4: Pull Docker images
echo "🐳 Step 4: Pulling Docker images..."
echo ""

docker-compose pull || print_warning "Could not pull some images (will build instead)"

echo ""

# Step 5: Build Docker containers
echo "🔨 Step 5: Building Docker containers..."
echo ""

docker-compose build

print_success "Docker containers built successfully"

echo ""

# Step 6: Start services
echo "🚀 Step 6: Starting services..."
echo ""

docker-compose up -d

# Wait for services to be ready
echo "Waiting for services to start..."
sleep 10

# Check if services are running
if docker-compose ps | grep -q "running"; then
    print_success "Services started successfully"
else
    print_error "Some services failed to start"
    echo ""
    echo "Check logs with: docker compose logs"
    exit 1
fi

echo ""

# Step 7: Verify services
echo "✅ Step 7: Verifying services..."
echo ""

# Check MongoDB
if docker exec pdfify-mongo-1 mongosh --eval "db.version()" &> /dev/null; then
    print_success "MongoDB is running"
else
    print_error "MongoDB is not responding"
fi

# Check Node.js API
if curl -s http://localhost:3002/ &> /dev/null; then
    print_success "Node.js API is running (http://localhost:3002)"
else
    print_warning "Node.js API is not responding yet (may need more time)"
fi

# Check Python service
if curl -s http://localhost:5000/health &> /dev/null || curl -s http://localhost:5000/ &> /dev/null; then
    print_success "Python service is running"
else
    print_warning "Python service is not responding yet"
fi

echo ""

# Step 8: Create test user
echo "👤 Step 8: Creating test user..."
echo ""

TEST_EMAIL="dev@test.com"
TEST_PASSWORD="testpassword123"

sleep 5  # Wait a bit more for API to be fully ready

REGISTER_RESPONSE=$(curl -s -X POST http://localhost:3002/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" 2>/dev/null || echo '{"error":"API not ready"}')

if echo "$REGISTER_RESPONSE" | grep -q "apiKey"; then
    API_KEY=$(echo "$REGISTER_RESPONSE" | grep -o '"apiKey":"[^"]*"' | cut -d'"' -f4)
    print_success "Test user created successfully"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📝 Test User Credentials:"
    echo "   Email: $TEST_EMAIL"
    echo "   Password: $TEST_PASSWORD"
    echo "   API Key: $API_KEY"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    # Save credentials to a file
    cat > test-credentials.txt << EOF
PDFify Test Credentials
========================

Email: $TEST_EMAIL
Password: $TEST_PASSWORD
API Key: $API_KEY

Dashboard: http://localhost:3002/user-dashboard.html
Login: http://localhost:3002/login.html

API Test Command:
curl -X POST http://localhost:3002/api/generate-invoice \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: $API_KEY" \\
  -d '{"template":"english","preview":true,"requests":[{"data":{"invoiceNumber":"TEST-001","invoiceDate":"2025-11-02","seller":{"name":"Test Co","address":"123 St"},"buyer":{"name":"Customer","address":"456 Ave"},"items":[{"description":"Item","quantity":1,"unitPrice":100,"total":100}],"total":100}}]}'
EOF

    print_success "Credentials saved to test-credentials.txt"
else
    print_warning "Could not create test user automatically"
    echo "You can create one manually later using the API"
fi

echo ""

# Step 9: Show service information
echo "📊 Step 9: Service Information"
echo ""
docker compose ps

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Setup Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🌐 Access Points:"
echo "   • Landing Page:    http://localhost:3002/"
echo "   • User Dashboard:  http://localhost:3002/user-dashboard.html"
echo "   • Login Page:      http://localhost:3002/login.html"
echo "   • API Base:        http://localhost:3002/api"
echo ""
echo "🔧 Useful Commands:"
echo "   • View logs:       docker compose logs -f"
echo "   • Stop services:   docker compose down"
echo "   • Restart:         docker compose restart"
echo "   • Rebuild:         docker compose up -d --build"
echo ""
echo "📚 Documentation:"
echo "   • WSL Setup:       .context/wsl-docker-setup.md"
echo "   • Development:     .context/development-guide.md"
echo "   • API Reference:   .context/api-reference.md"
echo ""
echo "🧪 Test your setup:"
echo "   ./test-local-env.sh"
echo ""
print_success "Your local PDFify environment is ready!"
echo ""
