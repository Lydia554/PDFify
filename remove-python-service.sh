#!/bin/bash

# Remove Python Service from PDFify
# This script safely removes the unused Python service container

set -e  # Exit on error

echo "🧹 PDFify - Remove Python Service"
echo "=================================="
echo ""

# Confirm with user
read -p "This will remove the Python service (not being used). Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Aborted"
    exit 1
fi

echo ""
echo "📋 Step 1: Backing up current docker-compose.yml..."
cp docker-compose.yml docker-compose.yml.backup
echo "✅ Backup created: docker-compose.yml.backup"

echo ""
echo "📋 Step 2: Archiving python-service directory..."
if [ -d "python-service" ]; then
    tar -czf python-service-backup-$(date +%Y%m%d-%H%M%S).tar.gz python-service/
    echo "✅ Archive created: python-service-backup-*.tar.gz"
else
    echo "ℹ️  python-service directory not found"
fi

echo ""
echo "📋 Step 3: Updating docker-compose.yml..."
cat > docker-compose.yml << 'EOF'
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
EOF
echo "✅ docker-compose.yml updated"

echo ""
echo "📋 Step 4: Stopping existing containers..."
docker compose down
echo "✅ Containers stopped"

echo ""
echo "📋 Step 5: Starting updated services..."
docker compose up -d
echo "✅ Services started"

echo ""
echo "📋 Step 6: Checking service health..."
sleep 5
docker compose ps

echo ""
echo "✅ Python service successfully removed!"
echo ""
echo "Next steps:"
echo "  1. Test PDF generation: ./test-local-env.sh"
echo "  2. If everything works, remove python-service directory:"
echo "     rm -rf python-service/"
echo "  3. Commit changes to git:"
echo "     git add docker-compose.yml"
echo "     git commit -m 'Remove unused Python service'"
echo ""
echo "Backups created:"
echo "  - docker-compose.yml.backup"
echo "  - python-service-backup-*.tar.gz"
echo ""
echo "To rollback:"
echo "  mv docker-compose.yml.backup docker-compose.yml"
echo "  docker compose down && docker compose up -d"
echo ""
