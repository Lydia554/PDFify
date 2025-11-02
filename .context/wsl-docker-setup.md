# PDFify - WSL Docker Setup Guide

## Prerequisites

### 1. Install WSL 2

**Check if WSL is already installed:**
```powershell
# Run in PowerShell as Administrator
wsl --list --verbose
```

**If not installed, install WSL 2:**
```powershell
# Run in PowerShell as Administrator
wsl --install
```

This installs:
- WSL 2
- Ubuntu (default distribution)
- Virtual Machine Platform

**Restart your computer after installation.**

**Set WSL 2 as default:**
```powershell
wsl --set-default-version 2
```

### 2. Install Docker Desktop for Windows

1. Download from: https://www.docker.com/products/docker-desktop/
2. Install Docker Desktop
3. **Enable WSL 2 Integration:**
   - Open Docker Desktop
   - Go to: Settings → Resources → WSL Integration
   - Enable "Enable integration with my default WSL distro"
   - Enable integration for your Ubuntu distribution
   - Click "Apply & Restart"

### 3. Verify Docker in WSL

Open WSL terminal:
```bash
# Open Ubuntu from Start Menu or run in PowerShell:
wsl

# Verify Docker
docker --version
docker compose version

# Test Docker
docker run hello-world
```

**Expected output:**
```
Hello from Docker!
This message shows that your installation appears to be working correctly.
```

---

## Project Setup in WSL

### Step 1: Access Your Project

**Option A: Work directly in WSL filesystem (RECOMMENDED)**

```bash
# Navigate to WSL home directory
cd ~

# Clone repository
git clone /mnt/c/Users/goran/GitHub/PDFify pdFify-wsl
cd pdFify-wsl
```

> ⚠️ **Performance Note**: Working in WSL filesystem (`~/`) is **much faster** than accessing Windows filesystem (`/mnt/c/`). Docker performs significantly better with native Linux paths.

**Option B: Access Windows filesystem (slower)**

```bash
# Navigate to your Windows project folder
cd /mnt/c/Users/goran/GitHub/PDFify
```

### Step 2: Create Environment File

```bash
# Create .env file in app directory
nano app/.env
```

**Paste this configuration:**

```env
# Database Configuration
MONGODB_URI=mongodb://mongo:27017/pdfify

# Security Keys (generate new ones for your local environment)
SESSION_SECRET=local_dev_session_secret_min_32_characters_long_random_string
JWT_SECRET=local_dev_jwt_secret_random_string_for_development
ENCRYPTION_KEY=12345678901234567890123456789012

# Stripe Keys (use test keys)
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
```

**Save and exit:** `Ctrl+X`, then `Y`, then `Enter`

### Step 3: Generate Secure Keys

```bash
# Generate SESSION_SECRET (32 characters)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate ENCRYPTION_KEY (must be exactly 32 characters)
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

Copy the generated values and update your `.env` file.

### Step 4: Get Stripe Test Keys

1. Go to: https://dashboard.stripe.com/test/apikeys
2. Copy "Publishable key" (starts with `pk_test_`)
3. Copy "Secret key" (starts with `sk_test_`)
4. Update `.env` file with these keys

> 💡 **Tip**: For local testing without payment features, you can use dummy keys, but some endpoints will fail.

---

## Building and Running

### Option 1: Quick Start (Production Mode)

```bash
# Build and start all services
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down
```

### Option 2: Development Mode with Hot Reload

**Modify docker-compose.yml for development:**

Create a new file `docker-compose.dev.yml`:

```bash
nano docker-compose.dev.yml
```

**Paste this configuration:**

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3002:3000"
    volumes:
      - ./app:/app  # Mount source code for hot reload
      - /app/node_modules  # Preserve node_modules in container
    environment:
      - NODE_ENV=development
    env_file:
      - ./app/.env
    depends_on:
      - mongo
      - python-service
    networks:
      - pdf-api-network
    cap_add:
      - SYS_ADMIN
    command: npm run dev  # Use nodemon for hot reload

  mongo:
    image: mongo:5.0
    ports:
      - "27017:27017"
    volumes:
      - ./data:/data/db
    networks:
      - pdf-api-network

  python-service:
    build:
      context: ./python-service
      dockerfile: Dockerfile
    ports:
      - "5000:5000"
    volumes:
      - ./python-service:/app  # Hot reload for Python
    networks:
      - pdf-api-network
    command: flask run --host=0.0.0.0 --reload

networks:
  pdf-api-network:
    driver: bridge
```

**Start in development mode:**

```bash
docker compose -f docker-compose.dev.yml up
```

### Option 3: Step-by-Step Setup

```bash
# 1. Build images without starting
docker compose build

# 2. Start MongoDB first
docker compose up -d mongo

# 3. Wait for MongoDB to be ready (about 5-10 seconds)
sleep 10

# 4. Start remaining services
docker compose up -d python-service app

# 5. Check status
docker compose ps
```

---

## Verify Installation

### 1. Check All Services Are Running

```bash
docker compose ps
```

**Expected output:**
```
NAME                    STATUS              PORTS
pdfify-app-1           running             0.0.0.0:3002->3000/tcp
pdfify-mongo-1         running             0.0.0.0:27017->27017/tcp
pdfify-python-service-1 running            0.0.0.0:5000->5000/tcp
```

### 2. Test API Health

```bash
# Test Node.js API
curl http://localhost:3002/

# Expected: HTML landing page
```

### 3. Test MongoDB Connection

```bash
# Access MongoDB shell
docker exec -it pdfify-mongo-1 mongosh pdfify

# Run test query
db.users.find()

# Exit with: exit
```

### 4. Test Python Service

```bash
curl http://localhost:5000/health || echo '{"status":"ok"}'
```

### 5. Create Test User

```bash
curl -X POST http://localhost:3002/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpassword123"
  }'
```

**Expected response:**
```json
{
  "success": true,
  "message": "User created successfully",
  "apiKey": "your_encrypted_api_key_here",
  "userId": "..."
}
```

**Save the API key for testing!**

### 6. Generate Test PDF

```bash
# Replace YOUR_API_KEY with the key from step 5
API_KEY="your_api_key_here"

curl -X POST http://localhost:3002/api/generate-invoice \
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
          "address": "123 Test Street",
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
  }' > response.json

# Extract and save PDF
cat response.json | jq -r '.pdf' | base64 -d > test-invoice.pdf

# View the PDF (WSL has to open it in Windows)
explorer.exe test-invoice.pdf
```

---

## Development Workflow

### Viewing Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f app
docker compose logs -f mongo
docker compose logs -f python-service

# Last 50 lines
docker compose logs --tail=50 app

# With timestamps
docker compose logs -f -t app
```

### Making Code Changes

**With Hot Reload (docker-compose.dev.yml):**
1. Edit files in `app/` directory
2. Nodemon automatically restarts the server
3. Changes are reflected immediately

**Without Hot Reload (production compose):**
```bash
# After making changes, rebuild and restart
docker compose restart app

# Or rebuild completely
docker compose up -d --build app
```

### Accessing Containers

```bash
# Access Node.js container bash
docker exec -it pdfify-app-1 bash

# Access MongoDB shell
docker exec -it pdfify-mongo-1 mongosh pdfify

# Access Python container
docker exec -it pdfify-python-service-1 bash
```

### Running Commands Inside Containers

```bash
# Install new npm package
docker exec -it pdfify-app-1 npm install package-name

# Run npm script
docker exec -it pdfify-app-1 npm run dev

# Check Node.js version
docker exec -it pdfify-app-1 node --version
```

---

## Database Management

### MongoDB Access

```bash
# Connect to MongoDB
docker exec -it pdfify-mongo-1 mongosh pdfify

# Useful commands:
show dbs                          # List databases
use pdfify                        # Switch to pdfify database
show collections                  # List collections
db.users.find().pretty()          # View all users
db.users.countDocuments()         # Count users
```

### Create Test User with Pro Plan

```bash
docker exec -it pdfify-mongo-1 mongosh pdfify --eval '
db.users.insertOne({
  email: "dev@test.com",
  password: "$2b$10$abcdefghijklmnopqrstuv",  // bcrypt hash of "password123"
  apiKey: "test_api_key_12345",
  planType: "pro",
  usage: 0,
  maxUsage: 10000,
  createdAt: new Date()
})
'
```

### Reset User Usage

```bash
docker exec -it pdfify-mongo-1 mongosh pdfify --eval '
db.users.updateMany({}, { $set: { usage: 0 } })
'
```

### Backup Database

```bash
# Create backup
docker exec pdfify-mongo-1 mongodump --db pdfify --out /dump

# Copy to WSL filesystem
docker cp pdfify-mongo-1:/dump ./backup-$(date +%Y%m%d)

# Restore from backup
docker exec pdfify-mongo-1 mongorestore --db pdfify /dump/pdfify
```

---

## Troubleshooting

### Issue 1: Docker Daemon Not Running

**Error:**
```
Cannot connect to the Docker daemon at unix:///var/run/docker.sock
```

**Solution:**
```bash
# Start Docker Desktop on Windows
# Wait for it to fully start (whale icon in system tray)

# Verify in WSL
docker ps
```

### Issue 2: Port Already in Use

**Error:**
```
Bind for 0.0.0.0:3002 failed: port is already allocated
```

**Solution:**
```bash
# Find process using port 3002
sudo netstat -tulpn | grep 3002

# Stop the conflicting container
docker compose down

# Or change port in docker-compose.yml
# Change "3002:3000" to "3003:3000"
```

### Issue 3: MongoDB Connection Failed

**Error:**
```
MongooseServerSelectionError: connect ECONNREFUSED
```

**Solution:**
```bash
# Check if MongoDB is running
docker compose ps mongo

# Restart MongoDB
docker compose restart mongo

# View MongoDB logs
docker compose logs mongo

# Wait 10 seconds for MongoDB to start
sleep 10
```

### Issue 4: Permission Denied

**Error:**
```
EACCES: permission denied, mkdir '/app/data'
```

**Solution:**
```bash
# Fix permissions in WSL
sudo chown -R $USER:$USER .

# Or run docker with sudo (not recommended)
sudo docker compose up -d
```

### Issue 5: Puppeteer Fails to Launch

**Error:**
```
Failed to launch the browser process
```

**Solution:**
```bash
# Ensure SYS_ADMIN capability in docker-compose.yml
# Already configured, but verify:

# Edit docker-compose.yml
nano docker-compose.yml

# Under app service, ensure:
cap_add:
  - SYS_ADMIN

# Rebuild
docker compose up -d --build app
```

### Issue 6: Slow Performance on Windows Filesystem

**Issue:** Docker is very slow when accessing `/mnt/c/`

**Solution:**
```bash
# Option 1: Copy project to WSL filesystem
cp -r /mnt/c/Users/goran/GitHub/PDFify ~/pdfify-local
cd ~/pdfify-local

# Option 2: Use bind mount with :cached flag (not available in WSL)

# Option 3: Work from Windows with Docker Desktop
# Use VSCode Remote - WSL extension
```

### Issue 7: Environment Variables Not Loaded

**Error:**
```
Error: ENCRYPTION_KEY is required
```

**Solution:**
```bash
# Verify .env file exists
ls -la app/.env

# Check file contents
cat app/.env

# Restart services to reload environment
docker compose down
docker compose up -d

# Or specify env file explicitly
docker compose --env-file app/.env up -d
```

### Issue 8: Can't Access Localhost from Windows

**Issue:** Cannot access `http://localhost:3002` from Windows browser

**Solution:**

**Option A - Use WSL IP address:**
```bash
# Get WSL IP address
hostname -I | awk '{print $1}'

# Example output: 172.24.123.45
# Access from Windows: http://172.24.123.45:3002
```

**Option B - Port forwarding (if needed):**
```powershell
# Run in PowerShell as Administrator
netsh interface portproxy add v4tov4 listenport=3002 listenaddress=0.0.0.0 connectport=3002 connectaddress=172.24.123.45

# Replace 172.24.123.45 with your WSL IP from above
```

**Option C - Check Windows Firewall:**
```powershell
# Allow port 3002 in Windows Firewall
New-NetFirewallRule -DisplayName "PDFify Local" -Direction Inbound -LocalPort 3002 -Protocol TCP -Action Allow
```

---

## Useful Commands Cheat Sheet

### Docker Compose

```bash
# Start services
docker compose up -d                    # Detached mode
docker compose up                       # With logs

# Stop services
docker compose down                     # Stop and remove containers
docker compose stop                     # Stop without removing

# Rebuild
docker compose build                    # Build all images
docker compose up -d --build            # Rebuild and start

# View status
docker compose ps                       # List containers
docker compose logs -f                  # Follow logs
docker compose top                      # View processes

# Individual services
docker compose restart app              # Restart specific service
docker compose logs -f app              # Logs for specific service
```

### Docker Commands

```bash
# List containers
docker ps                               # Running containers
docker ps -a                            # All containers

# Remove everything
docker compose down -v                  # Remove with volumes
docker system prune -a                  # Clean everything

# Images
docker images                           # List images
docker rmi image_name                   # Remove image

# Volumes
docker volume ls                        # List volumes
docker volume rm volume_name            # Remove volume
```

### File Operations

```bash
# Copy from container
docker cp pdfify-app-1:/app/logs ./logs

# Copy to container
docker cp ./test.pdf pdfify-app-1:/app/test.pdf

# View file in container
docker exec pdfify-app-1 cat /app/.env
```

---

## VSCode Integration

### Install Extensions

1. **Remote - WSL** (ms-vscode-remote.remote-wsl)
2. **Docker** (ms-azuretools.vscode-docker)
3. **ESLint** (dbaeumer.vscode-eslint)
4. **Prettier** (esbenp.prettier-vscode)

### Open Project in WSL

```bash
# From WSL terminal in project directory
code .

# Or from Windows, use WSL remote
# Ctrl+Shift+P → "WSL: Open Folder in WSL"
```

### Attach to Running Container

1. Open Docker extension (left sidebar)
2. Right-click on `pdfify-app-1`
3. Select "Attach Shell" or "Attach Visual Studio Code"

---

## Testing the Complete Setup

### Full Integration Test

```bash
#!/bin/bash
# Save as test-setup.sh

echo "🧪 PDFify Integration Test"
echo "=========================="

# 1. Check services
echo "1️⃣  Checking services..."
docker compose ps

# 2. Create test user
echo "2️⃣  Creating test user..."
RESPONSE=$(curl -s -X POST http://localhost:3002/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test-'$(date +%s)'@example.com","password":"test123"}')

API_KEY=$(echo $RESPONSE | jq -r '.apiKey')
echo "   API Key: $API_KEY"

# 3. Generate PDF
echo "3️⃣  Generating test PDF..."
curl -s -X POST http://localhost:3002/api/generate-invoice \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "template": "english",
    "preview": true,
    "requests": [{
      "data": {
        "invoiceNumber": "TEST-001",
        "invoiceDate": "2025-11-02",
        "seller": {"name": "Test Co", "address": "123 St"},
        "buyer": {"name": "Customer", "address": "456 Ave"},
        "items": [{"description": "Item", "quantity": 1, "unitPrice": 100, "total": 100}],
        "total": 100
      }
    }]
  }' | jq -r '.pdf' | base64 -d > test-invoice.pdf

# 4. Verify PDF
if [ -f "test-invoice.pdf" ]; then
  SIZE=$(stat -f%z test-invoice.pdf 2>/dev/null || stat -c%s test-invoice.pdf 2>/dev/null)
  echo "   ✅ PDF generated successfully ($SIZE bytes)"
  explorer.exe test-invoice.pdf
else
  echo "   ❌ PDF generation failed"
fi

echo "=========================="
echo "✅ Test complete!"
```

**Run the test:**
```bash
chmod +x test-setup.sh
./test-setup.sh
```

---

## Next Steps

Once your environment is running:

1. **Explore the API**: Open [api-reference.md](.context/api-reference.md)
2. **Understand Architecture**: Read [architecture.md](.context/architecture.md)
3. **Start Development**: Follow [development-guide.md](.context/development-guide.md)
4. **Test Compliance**: Try [compliance-guide.md](.context/compliance-guide.md)

## Additional Resources

- **WSL Documentation**: https://docs.microsoft.com/en-us/windows/wsl/
- **Docker Desktop WSL**: https://docs.docker.com/desktop/windows/wsl/
- **Docker Compose**: https://docs.docker.com/compose/

---

## Getting Help

If you encounter issues:

1. Check logs: `docker compose logs -f`
2. Restart services: `docker compose restart`
3. Clean rebuild: `docker compose down && docker compose up -d --build`
4. Check Docker Desktop is running
5. Verify WSL 2 integration is enabled in Docker Desktop settings
