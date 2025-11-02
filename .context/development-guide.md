# PDFify - Development Guide

## Getting Started

### Prerequisites

- **Docker** 20.10+
- **Docker Compose** 2.0+
- **Node.js** 20+ (for local development without Docker)
- **Git**

### Initial Setup

1. **Clone Repository**
```bash
git clone <repository-url>
cd PDFify
```

2. **Create Environment File**

Create `app/.env` with required variables:

```env
# Database
MONGODB_URI=mongodb://mongo:27017/pdfify

# Security
SESSION_SECRET=your_random_session_secret_min_32_chars
JWT_SECRET=your_random_jwt_secret
ENCRYPTION_KEY=your_32_character_encryption_key_exactly

# Stripe (get from https://stripe.com/docs/keys)
STRIPE_SECRET_KEY=sk_test_your_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# PDF/A Configuration
PDFA_ICC_PROFILE=./server/Helpers/sRGB_v4_ICC_preference.icc

# URLs
SUCCESS_URL=http://localhost:3000/success
CANCEL_URL=http://localhost:3000/cancel

# Development
NODE_ENV=development
DEBUG_MODE=true
FORCE_PLAN=pro  # Optional: force plan for testing
```

3. **Start Services**

```bash
# Production mode
docker compose up -d

# Development mode with logs
docker compose up

# Rebuild after code changes
docker compose up -d --build
```

4. **Verify Services**

```bash
# Check all containers are running
docker ps

# Expected output:
# - pdfify-app-1 (port 3002:3000)
# - pdfify-mongo-1 (port 27017)
# - pdfify-python-service-1 (port 5000)

# Test API endpoint
curl http://localhost:3002/api/health
```

---

## Project Structure

### Directory Layout

```
PDFify/
├── app/                                  # Main Node.js application
│   ├── server/
│   │   ├── index.js                      # Entry point (165 lines)
│   │   ├── models/                       # MongoDB schemas
│   │   ├── routes/                       # API endpoints
│   │   ├── middleware/                   # Auth & validation
│   │   ├── Helpers/                      # PDF utilities
│   │   ├── templates-friendly-mode/      # Pre-built templates
│   │   └── utils/                        # Shared utilities
│   ├── templates/                        # Developer mode templates
│   ├── public/                           # Static HTML/CSS/JS
│   ├── locales/                          # i18n translations
│   └── package.json                      # Dependencies
│
├── python-service/                       # ZUGFeRD microservice
│   ├── app.py                            # Flask app
│   ├── requirements.txt
│   └── Dockerfile
│
├── docker-compose.yml                    # Multi-container setup
├── Dockerfile                            # Node.js container
└── .github/workflows/deploy.yml          # CI/CD
```

### Key Files to Know

| File | Purpose | Lines |
|------|---------|-------|
| [app/server/index.js](app/server/index.js) | Main server, route mounting | 165 |
| [app/server/routes/invoiceRoutes.js](app/server/routes/invoiceRoutes.js) | Core PDF generation | 187 |
| [app/server/models/User.js](app/server/models/User.js) | User model with encryption | 130 |
| [app/server/Helpers/pdf-helpers.js](app/server/Helpers/pdf-helpers.js) | PDF/A & ZUGFeRD utilities | 57 |
| [app/templates/english-pro-compliant.js](app/templates/english-pro-compliant.js) | Compliant invoice template | ~200 |

---

## Development Workflows

### Adding a New API Endpoint

1. **Create Route File**

Create `app/server/routes/myNewRoute.js`:

```javascript
const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');

router.post('/my-endpoint', authenticate, async (req, res) => {
  try {
    const { data } = req.body;
    const user = req.user; // Available from middleware

    // Your logic here

    res.json({ success: true, result: 'data' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
```

2. **Register Route in index.js**

Edit [app/server/index.js](app/server/index.js):

```javascript
const myNewRoute = require('./routes/myNewRoute');
app.use('/api', myNewRoute);
```

3. **Test Endpoint**

```bash
curl -X POST http://localhost:3002/api/my-endpoint \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_api_key" \
  -d '{"data": "test"}'
```

---

### Creating a New PDF Template

1. **Create Template File**

Create `app/templates/my-template.js`:

```javascript
module.exports = function generateTemplate(data, t) {
  const {
    invoiceNumber,
    invoiceDate,
    seller,
    buyer,
    items,
    total
  } = data;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; }
        .header { text-align: center; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 8px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${t('invoice')}</h1>
        <p>${t('invoiceNumber')}: ${invoiceNumber}</p>
        <p>${t('date')}: ${invoiceDate}</p>
      </div>

      <table>
        <tr>
          <th>${t('seller')}</th>
          <th>${t('buyer')}</th>
        </tr>
        <tr>
          <td>${seller.name}<br>${seller.address}</td>
          <td>${buyer.name}<br>${buyer.address}</td>
        </tr>
      </table>

      <table>
        <thead>
          <tr>
            <th>${t('description')}</th>
            <th>${t('quantity')}</th>
            <th>${t('price')}</th>
            <th>${t('total')}</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td>${item.description}</td>
              <td>${item.quantity}</td>
              <td>${item.unitPrice}</td>
              <td>${item.total}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <p><strong>${t('total')}: ${total}</strong></p>
    </body>
    </html>
  `;
};
```

2. **Use Template in Route**

```javascript
const myTemplate = require('../templates/my-template');
const html = myTemplate(invoiceData, t);
```

3. **Add Translations**

Edit `app/locales/en.json`:

```json
{
  "invoice": "Invoice",
  "invoiceNumber": "Invoice Number",
  "seller": "Seller",
  "buyer": "Buyer"
}
```

---

### Adding a New E-commerce Platform

Example: Adding Etsy integration

1. **Create Routes Directory**

```bash
mkdir app/server/routes/etsy
```

2. **Create Route Files**

- `etsyApiRoutes.js` - Invoice generation
- `etsyWebhookRoutes.js` - Webhook handlers
- `etsyConfiguration.js` - Store setup
- `etsyOrders.js` - Order fetching

3. **Update ShopConfig Model**

Edit [app/server/models/ShopConfig.js](app/server/models/ShopConfig.js):

```javascript
platform: {
  type: String,
  enum: ['shopify', 'woocommerce', 'etsy'],
  required: true
}
```

4. **Add Localization**

Create `app/locales-etsy/en.json`

5. **Register Routes**

Edit [app/server/index.js](app/server/index.js):

```javascript
const etsyRoutes = require('./routes/etsy/etsyApiRoutes');
app.use('/api/etsy', etsyRoutes);
```

---

## Testing

### Manual API Testing

**Create Test User**:

```bash
curl -X POST http://localhost:3002/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpassword123"
  }'
```

**Generate Test Invoice**:

```bash
API_KEY="your_api_key_from_registration"

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
          "name": "Test Seller",
          "address": "123 Test St",
          "city": "Test City",
          "postalCode": "12345",
          "country": "USA"
        },
        "buyer": {
          "name": "Test Buyer",
          "address": "456 Test Ave"
        },
        "items": [{
          "description": "Test Product",
          "quantity": 1,
          "unitPrice": 100,
          "total": 100
        }],
        "total": 100
      }
    }]
  }' | jq -r '.pdf' | base64 -d > test-invoice.pdf
```

### PDF/A-3b Validation

```bash
# Inside Docker container
docker exec -it pdfify-app-1 bash

# Run validation script
npm run validate:pdf -- /path/to/invoice.pdf

# Expected output:
# ✓ PDF/A-3b validation passed
# ✓ XMP metadata present
# ✓ ZUGFeRD XML attached
```

---

## Debugging

### Enable Debug Mode

In `app/.env`:
```env
DEBUG_MODE=true
NODE_ENV=development
```

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f app
docker compose logs -f python-service

# Last 100 lines
docker compose logs --tail=100 app
```

### Common Issues

**1. Puppeteer fails to launch**
```
Error: Failed to launch the browser process
```

**Solution**: Ensure Docker has SYS_ADMIN capability in `docker-compose.yml`:
```yaml
services:
  app:
    cap_add:
      - SYS_ADMIN
```

**2. Ghostscript not found**
```
Error: gs: command not found
```

**Solution**: Rebuild Docker image with Ghostscript:
```bash
docker compose build --no-cache app
```

**3. MongoDB connection refused**
```
MongooseServerSelectionError: connect ECONNREFUSED
```

**Solution**: Check MongoDB is running:
```bash
docker compose ps mongo
docker compose up -d mongo
```

**4. Encryption key errors**
```
Error: Invalid key length
```

**Solution**: Ensure `ENCRYPTION_KEY` is exactly 32 characters:
```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

---

## Database Management

### Access MongoDB Shell

```bash
docker exec -it pdfify-mongo-1 mongosh pdfify
```

### Useful Queries

```javascript
// List all users
db.users.find().pretty()

// Find user by email
db.users.findOne({ email: 'test@example.com' })

// Update user plan
db.users.updateOne(
  { email: 'test@example.com' },
  { $set: { planType: 'pro', maxUsage: 1000 } }
)

// Reset monthly usage
db.users.updateMany({}, { $set: { usage: 0 } })

// View shop configurations
db.shopconfigs.find().pretty()

// Delete test data
db.users.deleteOne({ email: 'test@example.com' })
```

### Backup & Restore

```bash
# Backup
docker exec pdfify-mongo-1 mongodump --db pdfify --out /dump

# Copy from container
docker cp pdfify-mongo-1:/dump ./backup

# Restore
docker exec pdfify-mongo-1 mongorestore --db pdfify /dump/pdfify
```

---

## Deployment

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use strong `SESSION_SECRET` and `JWT_SECRET`
- [ ] Configure production MongoDB URI
- [ ] Set up Stripe production keys
- [ ] Configure HTTPS/SSL certificates
- [ ] Set up domain and DNS
- [ ] Enable webhook endpoints
- [ ] Configure email service (SMTP)
- [ ] Set up monitoring/logging
- [ ] Configure backups

### Manual Deployment

```bash
# SSH into server
ssh user@your-server.com

# Navigate to project
cd /path/to/PDFify

# Pull latest changes
git pull origin main

# Rebuild and restart
docker compose down
docker compose up -d --build

# Verify
docker compose ps
curl http://localhost:3002/api/health
```

### Automated Deployment (GitHub Actions)

Already configured in [.github/workflows/deploy.yml](.github/workflows/deploy.yml)

**Setup**:
1. Add SSH private key to GitHub Secrets (`SSH_PRIVATE_KEY`)
2. Add server details: `SSH_HOST`, `SSH_USER`, `SSH_PORT`
3. Push to `main` branch triggers deployment

---

## Environment Variables Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | `mongodb://mongo:27017/pdfify` |
| `SESSION_SECRET` | Session encryption key (32+ chars) | `random_32_char_string` |
| `JWT_SECRET` | JWT signing key | `another_random_string` |
| `ENCRYPTION_KEY` | AES-256 key (exactly 32 chars) | `16_byte_hex_string` |
| `STRIPE_SECRET_KEY` | Stripe secret API key | `sk_live_...` |
| `STRIPE_PUBLISHABLE_KEY` | Stripe public key | `pk_live_...` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `DEBUG_MODE` | Enable debug logging | `false` |
| `FORCE_PLAN` | Force user plan for testing | (none) |
| `PDFA_ICC_PROFILE` | Path to ICC color profile | `./server/Helpers/sRGB_v4_ICC_preference.icc` |
| `SUCCESS_URL` | Payment success redirect | `http://localhost:3000/success` |
| `CANCEL_URL` | Payment cancel redirect | `http://localhost:3000/cancel` |

---

## Code Style Guidelines

### JavaScript

```javascript
// Use async/await (not callbacks)
async function generatePDF(data) {
  try {
    const html = generateHTML(data);
    const pdf = await puppeteer.createPDF(html);
    return pdf;
  } catch (error) {
    console.error('PDF generation failed:', error);
    throw error;
  }
}

// Descriptive variable names
const invoiceData = req.body.data; // ✓ Good
const d = req.body.data;           // ✗ Bad

// Error handling in routes
router.post('/endpoint', async (req, res) => {
  try {
    // Logic
    res.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
```

### Naming Conventions

- **Files**: camelCase (e.g., `invoiceRoutes.js`)
- **Routes**: kebab-case (e.g., `/api/generate-invoice`)
- **Functions**: camelCase (e.g., `generatePDF()`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_FILE_SIZE`)
- **Models**: PascalCase (e.g., `User`, `ShopConfig`)

---

## Performance Tips

### PDF Generation Optimization

```javascript
// Reuse Puppeteer browser instance
let browser;
async function getBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  return browser;
}

// Use page pooling for batch
async function generateBatch(requests) {
  const browser = await getBrowser();
  const pages = await Promise.all(
    requests.map(() => browser.newPage())
  );

  const pdfs = await Promise.all(
    pages.map((page, i) => generatePDF(page, requests[i]))
  );

  await Promise.all(pages.map(page => page.close()));
  return pdfs;
}
```

### Database Indexing

```javascript
// In User model
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ apiKey: 1 });

// In ShopConfig model
shopConfigSchema.index({ userId: 1, platform: 1 });
shopConfigSchema.index({ shopDomain: 1 });
```

---

## Security Best Practices

### Input Validation

```javascript
const { body, validationResult } = require('express-validator');

router.post('/generate-invoice',
  authenticate,
  body('template').isIn(['english', 'english-pro-compliant']),
  body('requests').isArray({ min: 1, max: 50 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    // Process request
  }
);
```

### API Key Protection

```javascript
// Never log API keys
console.log('User:', user.email); // ✓ Good
console.log('API Key:', user.apiKey); // ✗ Bad - logs encrypted key

// Always decrypt when comparing
const decrypted = user.decryptApiKey();
if (decrypted === providedKey) {
  // Authenticate
}
```

### XSS Prevention

```javascript
// Sanitize user input in templates
const sanitize = require('sanitize-html');

function generateHTML(data) {
  const safeName = sanitize(data.customerName);
  return `<h1>${safeName}</h1>`;
}
```

---

## Contributing

### Pull Request Process

1. Create feature branch: `git checkout -b feature/my-feature`
2. Make changes and test locally
3. Commit with descriptive message: `git commit -m "Add new template for recipes"`
4. Push to fork: `git push origin feature/my-feature`
5. Create PR with description of changes
6. Wait for review and CI checks

### Commit Message Format

```
type(scope): Short description

Longer description if needed.

- Bullet points for details
- Multiple lines OK
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**Examples**:
```
feat(api): Add Etsy integration
fix(pdf): Resolve Ghostscript validation error
docs(readme): Update setup instructions
```
