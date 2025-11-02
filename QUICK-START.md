# 🚀 PDFify - Quick Start Guide (WSL + Docker)

## Prerequisites
- ✅ Windows 10/11 with WSL 2
- ✅ Docker Desktop with WSL integration enabled
- ✅ Git

---

## Setup (First Time Only)

### 1. Open WSL Terminal
```bash
# From Windows, open PowerShell and run:
wsl
```

### 2. Navigate to Project
```bash
cd /mnt/c/Users/goran/GitHub/PDFify
```

### 3. Run Setup Script
```bash
chmod +x setup-local-env.sh
./setup-local-env.sh
```

This will:
- ✅ Check all prerequisites
- ✅ Generate secure environment variables
- ✅ Build Docker containers
- ✅ Start all services (Node.js, MongoDB, Python)
- ✅ Create a test user for you

**Setup time:** ~5-10 minutes

---

## Daily Usage

### Start Services
```bash
cd /mnt/c/Users/goran/GitHub/PDFify
docker compose up -d
```

### Stop Services
```bash
docker compose down
```

### View Logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f app
```

### Restart After Code Changes
```bash
docker compose restart app
```

### Full Rebuild
```bash
docker compose down
docker compose up -d --build
```

---

## Access Your Local Environment

| Service | URL | Description |
|---------|-----|-------------|
| **Landing Page** | http://localhost:3002/ | Main website |
| **User Dashboard** | http://localhost:3002/user-dashboard.html | User control panel |
| **Login Page** | http://localhost:3002/login.html | Login form |
| **API Base** | http://localhost:3002/api | REST API |
| **MongoDB** | localhost:27017 | Database |

---

## Test Your Setup

### Run Full Test Suite
```bash
./test-local-env.sh
```

### Quick API Test
```bash
# Use the API key from test-credentials.txt
API_KEY="your_api_key_here"

curl -X POST http://localhost:3002/api/generate-invoice \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "template": "english",
    "preview": true,
    "requests": [{
      "data": {
        "invoiceNumber": "QUICK-TEST-001",
        "invoiceDate": "2025-11-02",
        "seller": {"name": "Test Co", "address": "123 St"},
        "buyer": {"name": "Customer", "address": "456 Ave"},
        "items": [{"description": "Item", "quantity": 1, "unitPrice": 100, "total": 100}],
        "total": 100
      }
    }]
  }' | jq -r '.pdf' | base64 -d > quick-test.pdf

# Open the PDF
explorer.exe quick-test.pdf
```

---

## Troubleshooting

### Services Won't Start
```bash
# Check if Docker Desktop is running (Windows system tray)
# Then restart services
docker compose down
docker compose up -d
```

### "Port Already in Use" Error
```bash
# Find what's using the port
sudo netstat -tulpn | grep 3002

# Stop conflicting service or change port in docker-compose.yml
```

### Can't Access localhost:3002 from Windows Browser
```bash
# Get WSL IP address
hostname -I | awk '{print $1}'

# Use that IP instead: http://172.x.x.x:3002
```

### MongoDB Connection Failed
```bash
# Restart MongoDB
docker compose restart mongo

# Wait 10 seconds
sleep 10

# Check status
docker compose ps
```

### Need Fresh Start
```bash
# Nuclear option - remove everything and start over
docker compose down -v
rm -rf data
./setup-local-env.sh
```

---

## Useful Commands

### Docker Management
```bash
# Check running containers
docker ps

# View container logs
docker compose logs app

# Access container shell
docker exec -it pdfify-app-1 bash

# Clean up unused Docker resources
docker system prune -a
```

### Database Access
```bash
# Access MongoDB shell
docker exec -it pdfify-mongo-1 mongosh pdfify

# View all users
db.users.find()

# Reset usage for all users
db.users.updateMany({}, { $set: { usage: 0 } })

# Exit MongoDB shell
exit
```

### Development
```bash
# Watch logs in real-time
docker compose logs -f app

# Restart specific service
docker compose restart app

# View service status
docker compose ps

# Run npm commands in container
docker exec -it pdfify-app-1 npm install package-name
```

---

## File Locations

| File/Directory | Purpose |
|----------------|---------|
| `app/.env` | Environment variables (API keys, secrets) |
| `app/server/` | Node.js backend code |
| `app/public/` | Frontend HTML/CSS/JS |
| `app/templates/` | PDF templates |
| `data/` | MongoDB data (persisted) |
| `test-credentials.txt` | Your test user login info |

---

## Performance Tips

### ⚡ Work in WSL Filesystem (Faster)
```bash
# Copy project to WSL filesystem for better performance
cp -r /mnt/c/Users/goran/GitHub/PDFify ~/pdfify-local
cd ~/pdfify-local

# Now run setup and development from here
./setup-local-env.sh
```

**Why?** Docker in WSL is ~10x faster when working with files in the native Linux filesystem (`~/`) vs Windows filesystem (`/mnt/c/`).

### 🔄 Use Development Mode (Hot Reload)
```bash
# Edit docker-compose.yml to mount source code
# See: .context/wsl-docker-setup.md for details
```

---

## Getting Help

### Documentation
- 📘 **[WSL Docker Setup](.context/wsl-docker-setup.md)** - Detailed setup guide
- 📗 **[Development Guide](.context/development-guide.md)** - Development workflow
- 📕 **[API Reference](.context/api-reference.md)** - API documentation
- 📙 **[Architecture](.context/architecture.md)** - System architecture
- 📓 **[Compliance Guide](.context/compliance-guide.md)** - PDF/A & ZUGFeRD

### Common Tasks
```bash
# View this quick start
cat QUICK-START.md

# Check service health
./test-local-env.sh

# View detailed logs
docker compose logs -f app

# Reset environment
docker compose down -v && ./setup-local-env.sh
```

---

## Next Steps

After your environment is running:

1. ✅ **Test the API** - Use test-credentials.txt to authenticate
2. ✅ **Explore the Dashboard** - Visit http://localhost:3002/user-dashboard.html
3. ✅ **Read the Docs** - Check out `.context/` directory
4. ✅ **Generate a PDF** - Use the quick API test above
5. ✅ **Start Developing** - Make changes and see them in action

---

## Support

If you encounter issues:
1. Check Docker Desktop is running
2. Run `./test-local-env.sh` to diagnose issues
3. View logs: `docker compose logs -f`
4. Read troubleshooting section in `.context/wsl-docker-setup.md`
5. Clean rebuild: `docker compose down && docker compose up -d --build`

---

**Happy Coding! 🎉**
