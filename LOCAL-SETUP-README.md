# 🏠 PDFify Local Development Setup

> Complete guide for setting up PDFify development environment in WSL with Docker

---

## 📋 Table of Contents

- [Overview](#overview)
- [What You'll Get](#what-youll-get)
- [Quick Setup](#quick-setup-3-steps)
- [Documentation](#documentation)
- [Architecture](#architecture)
- [Troubleshooting](#troubleshooting)

---

## Overview

This setup creates a **complete local development environment** for PDFify using Docker containers in Windows Subsystem for Linux (WSL). No need to install Node.js, MongoDB, or Python directly on your machine!

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Your Windows Machine                      │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                    WSL 2 (Ubuntu)                       │ │
│  │                                                         │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │          Docker Compose Network                  │  │ │
│  │  │                                                  │  │ │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │  │ │
│  │  │  │ Node.js  │  │ MongoDB  │  │   Python     │  │  │ │
│  │  │  │   App    │  │    DB    │  │  Service     │  │  │ │
│  │  │  │ Port 3000│  │ Port 27017│ │  Port 5000  │  │  │ │
│  │  │  └────┬─────┘  └────┬─────┘  └──────┬───────┘  │  │ │
│  │  │       │             │                │          │  │ │
│  │  └───────┼─────────────┼────────────────┼──────────┘  │ │
│  │          │             │                │             │ │
│  └──────────┼─────────────┼────────────────┼─────────────┘ │
│             │             │                │               │
│  ┌──────────▼─────────────▼────────────────▼─────────────┐ │
│  │         Port Forwarding to Windows                    │ │
│  │    localhost:3002, :27017, :5000                      │ │
│  └───────────────────────────────────────────────────────┘ │
│                          │                                 │
└──────────────────────────┼─────────────────────────────────┘
                           │
                           ▼
                  Windows Browser
              http://localhost:3002
```

---

## What You'll Get

After running the setup, you'll have:

✅ **Full-stack environment** running in Docker
- Node.js 20 with Express API
- MongoDB 5.0 database
- Python 3.11 microservice for ZUGFeRD

✅ **Pre-configured services**
- API running on http://localhost:3002
- MongoDB on localhost:27017
- Python service on localhost:5000

✅ **Test credentials**
- Test user with API key
- Access to dashboard and API

✅ **Development tools**
- Hot reload for code changes
- Log viewing
- Database access

✅ **Documentation**
- Complete API reference
- Architecture guide
- Development workflows

---

## Quick Setup (3 Steps)

### Step 1: Open WSL Terminal

```bash
# From Windows PowerShell
wsl
```

### Step 2: Navigate to Project

```bash
cd /mnt/c/Users/goran/GitHub/PDFify
```

### Step 3: Run Setup

```bash
chmod +x setup-local-env.sh
./setup-local-env.sh
```

**That's it!** ☕ Grab a coffee while it builds (5-10 minutes first time)

The script will:
1. ✅ Check Docker is installed and running
2. ✅ Generate secure environment variables
3. ✅ Create necessary directories
4. ✅ Build Docker images
5. ✅ Start all services
6. ✅ Create a test user
7. ✅ Verify everything works

---

## Verify Installation

### Run Test Suite

```bash
./test-local-env.sh
```

This tests:
- Docker services status
- Network connectivity
- Database operations
- API functionality
- PDF generation
- Python service
- File system permissions

**Expected output:**
```
🧪 PDFify Environment Test Suite
==================================

📦 Docker Services
------------------
✓ Docker daemon is running
✓ App container is running
✓ MongoDB container is running
✓ Python service container is running

...

📊 Test Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Tests:    20
Passed:         20
Failed:         0
Success Rate:   100%

✓ All tests passed! Your environment is working correctly.
```

### Manual Verification

**1. Check services are running:**
```bash
docker compose ps
```

**2. Visit in browser:**
- Landing page: http://localhost:3002/
- Dashboard: http://localhost:3002/user-dashboard.html

**3. Check test credentials:**
```bash
cat test-credentials.txt
```

**4. Generate test PDF:**
```bash
# Replace with your API key from test-credentials.txt
curl -X POST http://localhost:3002/api/generate-invoice \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"template":"english","preview":true,"requests":[{"data":{"invoiceNumber":"TEST-001","invoiceDate":"2025-11-02","seller":{"name":"Test Co","address":"123 St"},"buyer":{"name":"Customer","address":"456 Ave"},"items":[{"description":"Item","quantity":1,"unitPrice":100,"total":100}],"total":100}}]}' \
  | jq -r '.pdf' | base64 -d > test.pdf

# Open in Windows
explorer.exe test.pdf
```

---

## Documentation

Comprehensive documentation is available in the `.context/` directory:

### 📘 For Setup & Operations
- **[QUICK-START.md](QUICK-START.md)** - Quick reference card (START HERE!)
- **[.context/wsl-docker-setup.md](.context/wsl-docker-setup.md)** - Complete WSL/Docker setup guide
- **[.context/development-guide.md](.context/development-guide.md)** - Development workflows

### 📗 For Development
- **[.context/api-reference.md](.context/api-reference.md)** - Complete API documentation
- **[.context/architecture.md](.context/architecture.md)** - System architecture deep dive
- **[.context/project-overview.md](.context/project-overview.md)** - High-level overview

### 📕 For Compliance Features
- **[.context/compliance-guide.md](.context/compliance-guide.md)** - PDF/A-3b & ZUGFeRD guide

---

## Common Commands

### Starting & Stopping

```bash
# Start services
docker compose up -d

# Stop services
docker compose down

# Restart after code changes
docker compose restart app

# Full rebuild
docker compose down
docker compose up -d --build
```

### Viewing Logs

```bash
# All services
docker compose logs -f

# Just Node.js API
docker compose logs -f app

# Last 50 lines
docker compose logs --tail=50 app
```

### Database Access

```bash
# Open MongoDB shell
docker exec -it pdfify-mongo-1 mongosh pdfify

# View users
db.users.find()

# Reset usage
db.users.updateMany({}, { $set: { usage: 0 } })

# Exit
exit
```

### Container Access

```bash
# Access Node.js container
docker exec -it pdfify-app-1 bash

# Access MongoDB container
docker exec -it pdfify-mongo-1 bash

# Access Python container
docker exec -it pdfify-python-service-1 bash
```

---

## Troubleshooting

### Services Won't Start

**Problem:** Containers exit immediately

**Solution:**
```bash
# Check logs for errors
docker compose logs

# Verify .env file exists
ls -la app/.env

# Restart Docker Desktop
# Then try again
docker compose up -d
```

### Can't Access localhost:3002

**Problem:** Browser can't connect

**Solution:**
```bash
# Get WSL IP address
hostname -I | awk '{print $1}'

# Use WSL IP instead: http://172.x.x.x:3002
```

Or add port forwarding (PowerShell as Admin):
```powershell
$wslIp = (wsl hostname -I).Trim()
netsh interface portproxy add v4tov4 listenport=3002 listenaddress=0.0.0.0 connectport=3002 connectaddress=$wslIp
```

### MongoDB Connection Failed

**Problem:** API can't connect to database

**Solution:**
```bash
# Check MongoDB is running
docker compose ps mongo

# Restart MongoDB
docker compose restart mongo

# Wait for startup
sleep 10

# Check logs
docker compose logs mongo
```

### PDF Generation Fails

**Problem:** Puppeteer/Ghostscript errors

**Solution:**
```bash
# Rebuild with clean slate
docker compose down
docker compose build --no-cache app
docker compose up -d

# Check Ghostscript is installed
docker exec pdfify-app-1 which gs

# Check ICC profile exists
docker exec pdfify-app-1 ls -la /app/server/Helpers/*.icc
```

### Performance is Slow

**Problem:** Docker operations are sluggish

**Solution:** Work in WSL filesystem (much faster!)
```bash
# Copy project to WSL home directory
cp -r /mnt/c/Users/goran/GitHub/PDFify ~/pdfify-local
cd ~/pdfify-local

# Run setup from here
./setup-local-env.sh

# 10x faster than /mnt/c/ access!
```

### Fresh Start Needed

**Nuclear option:** Remove everything and start over
```bash
# Stop and remove containers, volumes, networks
docker compose down -v

# Remove data directory
rm -rf data

# Remove environment file
rm app/.env

# Re-run setup
./setup-local-env.sh
```

---

## Development Workflow

### 1. Start Services
```bash
cd /mnt/c/Users/goran/GitHub/PDFify
docker compose up -d
```

### 2. Make Code Changes
Edit files in `app/server/` or `app/public/`

### 3. Restart to Apply Changes
```bash
docker compose restart app
```

### 4. View Logs
```bash
docker compose logs -f app
```

### 5. Test Changes
```bash
# Use test script
./test-local-env.sh

# Or manual API tests
curl http://localhost:3002/api/...
```

### 6. Stop When Done
```bash
docker compose down
```

---

## Environment Variables

All configuration is in `app/.env`. The setup script creates this automatically.

**Key variables:**
```env
# Database
MONGODB_URI=mongodb://mongo:27017/pdfify

# Security (auto-generated)
SESSION_SECRET=...
JWT_SECRET=...
ENCRYPTION_KEY=...  # Must be exactly 32 chars

# Stripe (add your test keys)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# Development
NODE_ENV=development
DEBUG_MODE=true
FORCE_PLAN=pro  # Force pro plan for testing
```

Get Stripe test keys: https://dashboard.stripe.com/test/apikeys

---

## File Structure

```
PDFify/
├── app/                          # Main application
│   ├── server/                   # Backend code
│   │   ├── index.js             # Entry point
│   │   ├── routes/              # API endpoints
│   │   ├── models/              # Database models
│   │   ├── middleware/          # Auth & validation
│   │   └── Helpers/             # PDF utilities
│   ├── public/                   # Frontend files
│   ├── templates/                # PDF templates
│   └── .env                      # Environment variables
│
├── python-service/               # ZUGFeRD microservice
├── data/                         # MongoDB data (persisted)
│
├── .context/                     # Documentation
│   ├── wsl-docker-setup.md      # Setup guide
│   ├── development-guide.md     # Dev workflows
│   ├── api-reference.md         # API docs
│   └── ...
│
├── docker-compose.yml            # Container orchestration
├── Dockerfile                    # Node.js container
│
├── setup-local-env.sh           # Setup script
├── test-local-env.sh            # Test script
├── QUICK-START.md                # Quick reference
└── LOCAL-SETUP-README.md         # This file
```

---

## Next Steps

Now that your environment is set up:

1. **📚 Read the docs**
   - Start with [QUICK-START.md](QUICK-START.md)
   - Explore [.context/](.context/) directory

2. **🧪 Test the API**
   - Use credentials from `test-credentials.txt`
   - Try the API examples in [.context/api-reference.md](.context/api-reference.md)

3. **🎨 Explore the UI**
   - Visit http://localhost:3002/
   - Login at http://localhost:3002/login.html
   - Try the dashboard at http://localhost:3002/user-dashboard.html

4. **💻 Start coding**
   - Make changes to files in `app/`
   - Restart services: `docker compose restart app`
   - View logs: `docker compose logs -f app`

5. **🔬 Experiment**
   - Create custom PDF templates
   - Add new API endpoints
   - Test PDF/A-3b compliance features

---

## Support & Resources

### Documentation
- 📖 All guides in [.context/](.context/)
- 🚀 [QUICK-START.md](QUICK-START.md) - Quick reference
- 🔧 [.context/wsl-docker-setup.md](.context/wsl-docker-setup.md) - Detailed setup

### Commands
```bash
# View quick start
cat QUICK-START.md

# Run tests
./test-local-env.sh

# Check status
docker compose ps

# View logs
docker compose logs -f

# Get help
docker compose --help
```

### Common Issues
See the **Troubleshooting** section above or check:
- [.context/wsl-docker-setup.md#troubleshooting](.context/wsl-docker-setup.md#troubleshooting)
- Docker Desktop documentation
- WSL documentation

---

## Tips for Success

### 💡 Performance Tips
- Work in WSL filesystem (`~/`) for 10x faster Docker
- Use `docker compose down` when not developing (saves resources)
- Monitor logs to catch issues early: `docker compose logs -f`

### 🔐 Security Tips
- Never commit `.env` file to git (already in .gitignore)
- Use test Stripe keys for local development
- Regenerate keys for production deployment

### 🚀 Productivity Tips
- Keep a terminal open with `docker compose logs -f app`
- Use test script regularly: `./test-local-env.sh`
- Bookmark http://localhost:3002 for quick access
- Keep `test-credentials.txt` handy for API testing

---

## Summary

You now have:
- ✅ Complete local PDFify environment in Docker
- ✅ All services running (Node.js, MongoDB, Python)
- ✅ Test user and credentials
- ✅ Comprehensive documentation
- ✅ Setup and test scripts
- ✅ Troubleshooting guides

**Happy developing! 🎉**

---

**Questions?** Check the documentation in [.context/](.context/) or run `./test-local-env.sh` to diagnose issues.
