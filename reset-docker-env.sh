#!/bin/bash

# Complete Docker Environment Reset
# Fixes 'ContainerConfig' KeyError and other corruption issues

echo "🔄 Complete Docker Environment Reset"
echo "====================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }

echo "This will:"
echo "  1. Stop all containers"
echo "  2. Remove all PDFify containers"
echo "  3. Remove all PDFify images"
echo "  4. Clean up volumes and networks"
echo "  5. Rebuild everything from scratch"
echo ""
print_warning "This is safe - your code and .env file will NOT be deleted"
echo ""
read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo "🛑 Step 1: Stopping all containers..."
docker-compose down 2>/dev/null || true
print_success "Stopped"

echo ""
echo "🗑️  Step 2: Removing corrupted containers..."
# Remove containers by name pattern
docker ps -a | grep -E "pdf-api|pdfify" | awk '{print $1}' | xargs -r docker rm -f 2>/dev/null || true
print_success "Containers removed"

echo ""
echo "🗑️  Step 3: Removing old images..."
# Remove images
docker images | grep -E "pdf-api|pdfify" | awk '{print $3}' | xargs -r docker rmi -f 2>/dev/null || true
print_success "Images removed"

echo ""
echo "🗑️  Step 4: Cleaning volumes..."
# Remove named volume
docker volume rm pdfify_mongo-data 2>/dev/null || true
docker volume rm pdf-api_mongo-data 2>/dev/null || true
# Clean dangling volumes
docker volume prune -f
print_success "Volumes cleaned"

echo ""
echo "🗑️  Step 5: Cleaning networks..."
# Remove network
docker network rm pdf-api-network 2>/dev/null || true
docker network rm pdfify_pdf-api-network 2>/dev/null || true
# Clean unused networks
docker network prune -f
print_success "Networks cleaned"

echo ""
echo "🧹 Step 6: General Docker cleanup..."
docker system prune -f
print_success "Cleanup complete"

echo ""
echo "🔨 Step 7: Rebuilding images (this may take 5-10 minutes)..."
docker-compose build --no-cache

if [ $? -eq 0 ]; then
    print_success "Build successful"
else
    print_error "Build failed"
    echo ""
    echo "Check the error messages above and ensure:"
    echo "  - Docker Desktop is running"
    echo "  - You have internet connection"
    echo "  - Dockerfile exists in the project root"
    exit 1
fi

echo ""
echo "🚀 Step 8: Starting services..."
docker-compose up -d

echo "   Waiting for services to initialize..."
sleep 15

echo ""
echo "✅ Step 9: Verifying services..."

# Check containers
if docker-compose ps | grep -q "Up"; then
    print_success "Services are running"
else
    print_warning "Some services may not be ready yet"
fi

echo ""
echo "📊 Container Status:"
docker-compose ps

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Reset Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🔍 Check logs:"
echo "   docker-compose logs -f"
echo ""
echo "🌐 Access points:"
echo "   • API: http://localhost:3002/"
echo "   • MongoDB: localhost:27017"
echo "   • Python: http://localhost:5000/"
echo ""
echo "🧪 Test your setup:"
echo "   ./test-local-env.sh"
echo ""
