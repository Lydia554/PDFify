# CLAUDE.md - AI Assistant Guide for PDFify

> Comprehensive guide for AI assistants working with the PDFify codebase

**Last Updated:** 2025-11-18
**Repository:** PDFify - Professional PDF Generation Service
**Copyright:** © Lidija Jokić | Apache License 2.0

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Repository Structure](#repository-structure)
3. [Architecture & Design Patterns](#architecture--design-patterns)
4. [Development Workflows](#development-workflows)
5. [Key Conventions](#key-conventions)
6. [Common Tasks](#common-tasks)
7. [Testing & Validation](#testing--validation)
8. [Deployment](#deployment)
9. [Important Notes for AI Assistants](#important-notes-for-ai-assistants)

---

## Project Overview

### What is PDFify?

PDFify is a **production-ready, enterprise-grade PDF generation service** that transforms structured data (JSON, HTML, CSV) into beautifully styled, standards-compliant PDF documents. It serves both developers (via REST API) and non-technical users (via pre-built templates).

### Core Features

- **PDF Generation**: Convert JSON/HTML/CSV → professionally styled PDFs
- **E-commerce Integrations**: Shopify webhooks + WooCommerce REST API
- **Compliance**: PDF/A-3b archival standard + ZUGFeRD 2.1.1 XML embedding
- **Multi-tenant SaaS**: Usage tracking, subscription tiers (Free/Premium/Pro)
- **Internationalization**: English, German, Slovenian support

### Tech Stack

```
Backend:     Node.js 20, Express.js, MongoDB 5.0
PDF Engine:  Puppeteer (headless Chrome), pdf-lib, Ghostscript
Compliance:  ZUGFeRD via xmlbuilder2, PDF/A-3b via pdf-lib (Java optional)
Payments:    Stripe (subscriptions + token packs)
Auth:        JWT, bcrypt, AES-256-CBC encryption
Deployment:  Docker Compose, GitHub Actions CI/CD

Note: Python service exists in docker-compose but is NOT used (can be removed)
      Java/PDFBox used only for Shopify merchant PDF/A compliance (see ALTERNATIVES.md)
```

---

## Repository Structure

### Directory Layout

```
PDFify/
├── app/                              # Main application
│   ├── server/                       # Backend (Node.js/Express)
│   │   ├── index.js                  # App entry point
│   │   ├── routes/                   # API endpoints (17 route files)
│   │   │   ├── authRoutes.js         # Login, signup, password reset
│   │   │   ├── userRoutes.js         # Profile, integrations, API keys
│   │   │   ├── invoiceRoutes.js      # Core PDF generation
│   │   │   ├── htmlRoutes.js         # HTML → PDF conversion
│   │   │   ├── friendlyMode.js       # No-code templates
│   │   │   ├── paymentRoutes.js      # Stripe checkout
│   │   │   ├── stripeRoutes.js       # Stripe webhooks
│   │   │   ├── shopify/              # Shopify integration (6 files)
│   │   │   │   ├── shopifyApiRoutes.js
│   │   │   │   ├── shopifyWebhookRoutes.js
│   │   │   │   ├── customerInvoice.js
│   │   │   │   ├── merchantInvoice.js
│   │   │   │   ├── shopifyMerchantTemplate.js
│   │   │   │   └── shopifyHelpers.js
│   │   │   └── woocommerce/          # WooCommerce integration (4 files)
│   │   │       ├── woocommerceApiRoutes.js
│   │   │       ├── woocommerceWebhookRoutes.js
│   │   │       ├── customerInvoice.js
│   │   │       └── merchantsInvoice.js
│   │   ├── models/                   # Database schemas
│   │   │   ├── User.js               # User model (auth, integrations, usage)
│   │   │   └── ShopConfig.js         # Per-shop configuration
│   │   ├── middleware/               # Express middleware
│   │   │   ├── authenticate.js       # API key validation
│   │   │   ├── dualAuth.js           # Session OR API key auth
│   │   │   └── authProtect.js        # Session-only protection
│   │   ├── Helpers/                  # PDF utilities
│   │   │   ├── pdf-helpers.js        # XMP, ZUGFeRD, PDF/A helpers
│   │   │   ├── *.jar                 # Apache PDFBox libraries
│   │   │   └── *.icc                 # ICC color profiles
│   │   ├── utils/                    # Utility functions
│   │   │   ├── usageUtils.js         # Usage tracking & plan limits
│   │   │   ├── i18n.js               # Translation loader
│   │   │   ├── resolveLanguage.js    # Auto-detect language
│   │   │   └── turnstileVerification.js
│   │   ├── shared/
│   │   │   └── formatDate.js         # Date formatting
│   │   └── templates-friendly-mode/  # No-code templates
│   │       ├── invoice.js
│   │       ├── invoice-premium.js
│   │       ├── recipe.js
│   │       └── recipe-premium.js
│   ├── templates/                    # Developer templates
│   │   ├── english.js                # Standard invoice (colorful)
│   │   ├── english-pro-compliant.js  # PDF/A-3b invoice (B&W)
│   │   └── fonts/                    # Custom fonts
│   ├── public/                       # Frontend static files
│   │   ├── *.html                    # Landing, login, dashboard, etc.
│   │   ├── js/                       # Frontend JavaScript
│   │   ├── scripts-friendly-mode/    # Friendly mode UI
│   │   ├── images/                   # Logos, icons
│   │   └── demo/                     # Demo data
│   ├── locales/                      # i18n translations (en, de, sl)
│   ├── locales-shopify/              # Shopify-specific i18n
│   ├── locales-friendly/             # Friendly mode i18n
│   ├── xml/                          # ZUGFeRD XML generation
│   │   └── generateZugferdXml.js
│   ├── pdfs/                         # Temporary PDF storage
│   └── package.json                  # Dependencies
├── python-service/                   # Python microservice
│   ├── app.py                        # Flask app (Ghostscript wrapper)
│   ├── Dockerfile
│   └── requirements.txt
├── .context/                         # Documentation
│   ├── api-reference.md
│   ├── architecture.md
│   ├── compliance-guide.md
│   ├── development-guide.md
│   ├── project-overview.md
│   └── wsl-docker-setup.md
├── assets/                           # Repository images
├── .github/workflows/deploy.yml      # CI/CD
├── Dockerfile                        # Node.js app Docker image
├── docker-compose.yml                # Multi-container orchestration
├── setup-local-env.sh                # Local setup script
├── test-local-env.sh                 # Environment test script
├── README.md                         # Main documentation
├── QUICK-START.md                    # Quick reference
└── LOCAL-SETUP-README.md             # Local dev setup guide
```

### Key Files by Function

**Entry Points:**
- `app/server/index.js` - Express app initialization, route mounting

**Core Logic:**
- `app/server/routes/invoiceRoutes.js` - Main PDF generation endpoint
- `app/server/Helpers/pdf-helpers.js` - PDF/A compliance helpers
- `app/server/models/User.js` - User schema with encryption

**Templates:**
- `app/templates/english.js` - Standard colorful invoice
- `app/templates/english-pro-compliant.js` - B&W compliant invoice

**Integrations:**
- `app/server/routes/shopify/shopifyApiRoutes.js` - Shopify integration
- `app/server/routes/woocommerce/woocommerceApiRoutes.js` - WooCommerce integration

---

## Architecture & Design Patterns

### Multi-Service Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Compose Network                    │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Node.js    │───▶│   MongoDB    │    │   Python     │  │
│  │   Express    │    │     5.0      │    │   Flask      │  │
│  │   Port 3000  │    │  Port 27017  │    │  Port 5000   │  │
│  │              │    │              │    │              │  │
│  │ • REST API   │    │ • Users DB   │    │ • ZUGFeRD    │  │
│  │ • Puppeteer  │    │ • Sessions   │    │ • factur-x   │  │
│  │ • Ghostscript│    │ • Configs    │    │ • Validation │  │
│  └──────┬───────┘    └──────────────┘    └──────▲───────┘  │
│         │                                         │          │
│         └─────────────────────────────────────────┘          │
│                   HTTP POST (PDF + metadata)                 │
└─────────────────────────────────────────────────────────────┘
```

### Database Models

#### User Model (`app/server/models/User.js`)

**Purpose:** Core user entity with authentication, integrations, and usage tracking

**Key Fields:**
```javascript
{
  // Authentication
  email: String (unique),
  password: String (bcrypt hashed),
  apiKey: String (AES-256-CBC encrypted),

  // Shopify Integration
  connectedShopDomain: String,
  shopifyAccessToken: String (encrypted),

  // WooCommerce Integration
  connectedWooDomain: String,
  wooConsumerKey: String (encrypted),
  wooConsumerSecret: String (encrypted),
  allowCustomerPDF: Boolean,

  // Subscription
  stripeCustomerId: String,
  stripeSubscriptionId: String,
  planType: Enum ['free', 'premium', 'pro'],

  // Usage Tracking
  usageCount: Number,
  maxUsage: Number,  // 30 (free), 1000 (premium), 10000 (pro)
  usageLastReset: Date,
  previewCount: Number,
  previewLastReset: Date,

  // Email Verification
  isVerified: Boolean,
  verificationToken: String,
  verificationTokenExpiry: Date,

  // Account
  role: Enum ['user', 'admin'],
  isActive: Boolean,
  deleted: Boolean,
  deletedAt: Date,

  // Extras
  cookieConsent: Boolean,
  extraPages: Number  // Purchased additional pages
}
```

**Encryption Methods:**
- `getDecryptedApiKey()` - Returns decrypted API key
- `getDecryptedWooKeys()` - Returns decrypted WooCommerce credentials

**Encryption Strategy:**
- Algorithm: AES-256-CBC
- IV: 16 random bytes prepended to ciphertext
- Key: 32-character hex string from `process.env.ENCRYPTION_KEY`

#### ShopConfig Model (`app/server/models/ShopConfig.js`)

**Purpose:** Per-shop configuration for multi-tenant deployments

```javascript
{
  shopDomain: String (primary key),
  allowCustomerPDF: Boolean
}
```

### Authentication Patterns

**Three Middleware Types:**

1. **authenticate.js** - API key only (Bearer token or query param)
   ```javascript
   // Decrypts all users' API keys, finds match
   router.post('/api/endpoint', authenticate, handler);
   ```

2. **dualAuth.js** - API key OR session (flexible)
   ```javascript
   // Tries API key first, falls back to session.userId
   router.post('/endpoint', authenticate, dualAuth, handler);
   // Sets req.user (lightweight) + req.fullUser (full Mongoose doc)
   ```

3. **authProtect.js** - Session only (no API key)
   ```javascript
   // For HTML pages requiring login
   router.get('/dashboard', authProtect, handler);
   ```

### PDF Generation Workflow

```
1. Receive Request (JSON invoice data)
   ↓
2. Authenticate (API key or session via middleware)
   ↓
3. Check Usage Limits (usageUtils.incrementUsage - atomic)
   ↓
4. Determine Template
   - Free/Premium: english.js (colorful)
   - Pro + compliant: english-pro-compliant.js (B&W, PDF/A)
   ↓
5. Generate HTML from Template Function
   - invoiceData → generateInvoiceHTML(data) → HTML string
   ↓
6. Puppeteer Rendering
   - Launch headless Chrome
   - Load HTML + embedded fonts
   - Emit PDF buffer (A4, margins, page numbers)
   ↓
7. Pro/Compliant Flow (if applicable)
   - Embed XMP metadata (PDF/A-3b identification)
   - Embed ZUGFeRD XML (EU invoice standard)
   - Apply ICC profile (sRGB color space)
   - Validate with Ghostscript (optional)
   ↓
8. Return Response
   - Header: X-PDF-Page-Count (for usage tracking)
   - Body: PDF buffer (application/pdf)
   ↓
9. Increment Usage (atomic MongoDB $inc)
   - Respects plan limits
   - Auto-resets monthly
```

### Usage Tracking System

**Plan Limits** (defined in `app/server/utils/usageUtils.js`):
```javascript
PLAN_LIMITS = {
  free: 30,
  premium: 1000,
  pro: 10000
}

PREVIEW_LIMITS = {
  free: 3,
  premium: 10,
  pro: 25
}
```

**Key Function:**
```javascript
async function incrementUsage(user, pages, isPreview, forcePlan) {
  // 1. Check if monthly reset needed (1st of month)
  // 2. Verify against plan limits
  // 3. Atomically increment usageCount or previewCount
  // 4. Handle extraPages (purchased pages)
  // 5. Throw error if limit exceeded
}
```

**Monthly Reset:**
- Cron job runs 1st of month, 00:00 UTC
- Resets `usageCount` and `previewCount` to 0
- Updates `usageLastReset` and `previewLastReset`

---

## Development Workflows

### Local Development Setup

**Prerequisites:**
- Docker Desktop with WSL 2 (Windows)
- Git

**Quick Start:**
```bash
# 1. Open WSL terminal
wsl

# 2. Navigate to project
cd /mnt/c/Users/goran/GitHub/PDFify

# 3. Run setup script
chmod +x setup-local-env.sh
./setup-local-env.sh

# 4. Verify installation
./test-local-env.sh
```

**What the setup script does:**
- Generates `.env` file with secure secrets
- Creates necessary directories
- Builds Docker images
- Starts services (Node, MongoDB, Python)
- Creates test user with API key

**Access Points:**
- Landing page: http://localhost:3002/
- Dashboard: http://localhost:3002/user-dashboard.html
- API base: http://localhost:3002/api
- MongoDB: localhost:27017

### Common Development Commands

```bash
# Start services
docker compose up -d

# View logs (all services)
docker compose logs -f

# View logs (Node.js only)
docker compose logs -f app

# Restart after code changes
docker compose restart app

# Stop services
docker compose down

# Full rebuild
docker compose down
docker compose up -d --build

# Access Node.js container shell
docker exec -it pdfify-app-1 bash

# Access MongoDB shell
docker exec -it pdfify-mongo-1 mongosh pdfify

# Run tests
./test-local-env.sh
```

### Making Code Changes

1. **Edit files** in `app/server/` or `app/public/`
2. **Restart service**: `docker compose restart app`
3. **View logs**: `docker compose logs -f app`
4. **Test changes**: Use test script or manual API calls

### Database Operations

```bash
# Connect to MongoDB
docker exec -it pdfify-mongo-1 mongosh pdfify

# View all users
db.users.find()

# Find user by email
db.users.findOne({ email: "test@example.com" })

# Reset usage for all users
db.users.updateMany({}, { $set: { usageCount: 0 } })

# Update user plan
db.users.updateOne(
  { email: "test@example.com" },
  { $set: { planType: "pro" } }
)

# Exit MongoDB shell
exit
```

---

## Key Conventions

### 1. Logging Pattern

**Convention:** Use development-only logging
```javascript
const log = (message, data = null) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(message, data);
  }
};

log("Processing invoice", { orderId: 123 });
```

**Used throughout:** All route files use this pattern

### 2. Encryption Convention

**Auto-encrypt on save:**
```javascript
// In User model pre-save hook
userSchema.pre("save", async function(next) {
  if (this.isModified("apiKey")) {
    this.apiKey = encrypt(this.apiKey);
  }
  // ... other encrypted fields
});
```

**Decrypt on-demand:**
```javascript
// Instance method
userSchema.methods.getDecryptedApiKey = function() {
  return decrypt(this.apiKey);
};

// Usage in routes
const apiKey = user.getDecryptedApiKey();
```

**IMPORTANT:** Never log or return encrypted values to client

### 3. Invoice Source Tagging

**Pattern:** Tag requests with source context
```javascript
// In index.js route mounting
app.use("/api/shopify", (req, res, next) => {
  req.invoiceSource = "shopify";
  next();
}, shopifyApiRoutes);

// In templates - conditional logic
if (invoiceData.invoiceSource === "shopify") {
  // Shopify-specific rendering
}
```

**Valid sources:** `shopify`, `woocommerce`, `api`, `friendly`

### 4. Dual Authentication Pattern

**Used on endpoints accessible via both session and API key:**
```javascript
router.post(
  "/generate-invoice",
  authenticate,      // Validates API key
  dualAuth,          // Falls back to session if no API key
  async (req, res) => {
    // req.user - lightweight (just _id, email, planType)
    // req.fullUser - full Mongoose document
  }
);
```

### 5. Plan-Based Feature Gating

**Convention:** Check plan type for premium features
```javascript
if (user.planType === "pro" && invoiceData.compliant) {
  // Pro-only: PDF/A-3b + ZUGFeRD
  html = await generateInvoiceHTMLPro(invoiceData);
} else {
  // Standard: Colorful invoice
  html = await generateInvoiceHTML(invoiceData);
}
```

**Plan hierarchy:**
- `free` - Basic features, 30 pages/month
- `premium` - Logo upload, branding, 1000 pages/month
- `pro` - PDF/A-3b, ZUGFeRD, 10000 pages/month

### 6. Template Naming Conventions

**Structure:**
```
<language>-<tier>-<variant>.js

Examples:
- english.js                 → Standard colorful invoice
- english-pro-compliant.js   → B&W PDF/A-3b invoice
- invoice.js                 → Friendly mode standard
- invoice-premium.js         → Friendly mode premium
```

### 7. Localization Pattern

**Loading translations:**
```javascript
const locales = {
  sl: require("../../locales/sl.json"),
  en: require("../../locales/en.json"),
  de: require("../../locales/de.json")
};

// In templates
const locale = locales[lang] || locales["en"];
const text = locale["invoice.total"] || "Total";
```

**Language detection:**
```javascript
// From order data
const lang = resolveLanguage(orderData);  // Returns 'en', 'de', or 'sl'
```

### 8. Error Handling Convention

**API errors:**
```javascript
try {
  // ... operation
} catch (error) {
  console.error("Error:", error);
  return res.status(500).json({ error: "Descriptive error message" });
}
```

**Webhook handlers:**
```javascript
try {
  // ... webhook processing
} catch (error) {
  console.error("Webhook error:", error);
  // Still return 200 OK (idempotent - prevent retries)
  return res.status(200).json({ received: true });
}
```

### 9. Webhook Verification

**Shopify HMAC verification:**
```javascript
const generatedHmac = crypto
  .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
  .update(rawBody, "utf8")
  .digest("base64");

if (generatedHmac !== hmacHeader) {
  return res.status(401).json({ error: "Invalid HMAC" });
}
```

**Stripe signature verification:**
```javascript
const event = stripe.webhooks.constructEvent(
  req.body,
  req.headers['stripe-signature'],
  process.env.STRIPE_WEBHOOK_SECRET
);
```

### 10. Atomic Operations Pattern

**Usage increments (prevent race conditions):**
```javascript
// GOOD - Atomic MongoDB operation
await User.findByIdAndUpdate(
  userId,
  { $inc: { usageCount: pages } },
  { new: true }
);

// BAD - Read-modify-write (race condition)
user.usageCount += pages;
await user.save();
```

---

## Common Tasks

### Task 1: Add a New API Endpoint

**Steps:**

1. **Create or edit route file** in `app/server/routes/`
   ```javascript
   // app/server/routes/myNewRoute.js
   const express = require("express");
   const router = express.Router();
   const { authenticate } = require("../middleware/authenticate");

   router.post("/my-endpoint", authenticate, async (req, res) => {
     try {
       const user = req.user;
       // ... logic
       res.json({ success: true });
     } catch (error) {
       console.error("Error:", error);
       res.status(500).json({ error: error.message });
     }
   });

   module.exports = router;
   ```

2. **Mount route in `app/server/index.js`**
   ```javascript
   const myNewRoute = require("./routes/myNewRoute");
   app.use("/api/my-feature", myNewRoute);
   ```

3. **Restart service**
   ```bash
   docker compose restart app
   ```

4. **Test endpoint**
   ```bash
   curl -X POST http://localhost:3002/api/my-feature/my-endpoint \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"test": "data"}'
   ```

### Task 2: Add a New Database Field

**Steps:**

1. **Update model schema** in `app/server/models/User.js`
   ```javascript
   const userSchema = new mongoose.Schema({
     // ... existing fields
     newField: {
       type: String,
       default: null
     }
   });
   ```

2. **No migration needed** (MongoDB is schemaless)
   - Existing documents will return `undefined` for new field
   - Save operation will add field to document

3. **Update validation if needed**
   ```javascript
   newField: {
     type: String,
     required: true,
     validate: {
       validator: function(v) {
         return /regex/.test(v);
       },
       message: "Invalid format"
     }
   }
   ```

4. **Restart service**
   ```bash
   docker compose restart app
   ```

### Task 3: Create a New PDF Template

**Steps:**

1. **Create template file** in `app/templates/`
   ```javascript
   // app/templates/my-template.js
   function generateMyTemplateHTML(data) {
     return `
       <!DOCTYPE html>
       <html>
       <head>
         <meta charset="UTF-8">
         <style>
           body { font-family: Arial, sans-serif; }
           /* ... styles */
         </style>
       </head>
       <body>
         <h1>${data.title}</h1>
         <!-- ... template content -->
       </body>
       </html>
     `;
   }

   module.exports = { generateMyTemplateHTML };
   ```

2. **Use in route handler**
   ```javascript
   const { generateMyTemplateHTML } = require("../templates/my-template");

   const html = generateMyTemplateHTML(invoiceData);
   const browser = await puppeteer.launch({ headless: true });
   const page = await browser.newPage();
   await page.setContent(html);
   const pdfBuffer = await page.pdf({
     format: "A4",
     printBackground: true
   });
   await browser.close();
   ```

3. **Test rendering**
   - Generate PDF via API
   - Verify styling and content

### Task 4: Add a New Translation

**Steps:**

1. **Edit translation files** in `app/locales/`
   ```json
   // app/locales/en.json
   {
     "my.new.key": "English text"
   }

   // app/locales/de.json
   {
     "my.new.key": "Deutscher Text"
   }

   // app/locales/sl.json
   {
     "my.new.key": "Slovenski besedilo"
   }
   ```

2. **Use in templates**
   ```javascript
   const locale = locales[lang] || locales["en"];
   const text = locale["my.new.key"] || "Fallback";
   ```

3. **No restart needed** (loaded on each request)

### Task 5: Update Environment Variables

**Steps:**

1. **Edit `app/.env`**
   ```env
   NEW_VARIABLE=value
   ```

2. **Access in code**
   ```javascript
   const newVar = process.env.NEW_VARIABLE;
   ```

3. **Restart service** (required for env changes)
   ```bash
   docker compose restart app
   ```

4. **For production:** Update deployment secrets/config

---

## Testing & Validation

### Running Tests

**Full environment test:**
```bash
./test-local-env.sh
```

**Test coverage:**
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
```

### Manual API Testing

**Generate test invoice:**
```bash
# Get API key from test-credentials.txt
API_KEY="your_api_key_here"

curl -X POST http://localhost:3002/api/generate-invoice \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "template": "english",
    "preview": true,
    "requests": [{
      "data": {
        "invoiceNumber": "TEST-001",
        "invoiceDate": "2025-11-18",
        "seller": {
          "name": "Test Company",
          "address": "123 Test St"
        },
        "buyer": {
          "name": "Customer Name",
          "address": "456 Customer Ave"
        },
        "items": [{
          "description": "Test Item",
          "quantity": 1,
          "unitPrice": 100,
          "total": 100
        }],
        "total": 100
      }
    }]
  }' | jq -r '.pdf' | base64 -d > test.pdf

# Open PDF
explorer.exe test.pdf  # Windows
open test.pdf          # macOS
xdg-open test.pdf      # Linux
```

### PDF Compliance Validation

**Validate PDF/A-3b compliance:**
```bash
# Using Ghostscript
docker exec pdfify-app-1 gs \
  -dPDFA=3 \
  -dBATCH \
  -dNOPAUSE \
  -sDEVICE=pdfwrite \
  -sOutputFile=/dev/null \
  /app/pdfs/test.pdf

# Using VeraPDF (if installed)
verapdf --flavour 3b test.pdf
```

**Inspect PDF metadata:**
```bash
docker exec pdfify-app-1 node inspect-pdf.js /app/pdfs/test.pdf
```

---

## Deployment

### Docker Deployment

**Build images:**
```bash
docker compose build
```

**Start services:**
```bash
docker compose up -d
```

**View logs:**
```bash
docker compose logs -f
```

**Scale services:**
```bash
docker compose up -d --scale app=3
```

### GitHub Actions CI/CD

**Workflow:** `.github/workflows/deploy.yml`

**Trigger:** Push to `main` branch

**Steps:**
1. Checkout code
2. Build Docker image
3. Run tests (if configured)
4. Push to container registry
5. Deploy to production server

**Environment secrets required:**
- `DOCKER_USERNAME`
- `DOCKER_PASSWORD`
- `SSH_PRIVATE_KEY`
- Production `.env` variables

### Environment Variables for Production

**Required:**
```env
# Database
MONGODB_URI=mongodb://user:pass@host:27017/pdfify

# Security
SESSION_SECRET=<64+ char random string>
JWT_SECRET=<64+ char random string>
ENCRYPTION_KEY=<32 char hex string>

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Shopify
SHOPIFY_WEBHOOK_SECRET=<shared secret>

# Email
SENDGRID_API_KEY=SG....
FROM_EMAIL=noreply@pdfify.pro

# Cloudflare
TURNSTILE_SECRET_KEY=<secret>

# Environment
NODE_ENV=production
BASE_URL=https://pdfify.pro
PORT=3000
```

**Optional:**
```env
DEBUG_MODE=false
FORCE_PLAN=  # Leave empty for production
SENTRY_DSN=  # Error tracking
```

### Health Checks

**API health endpoint:**
```bash
curl http://localhost:3002/api/health
```

**Expected response:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-18T10:30:00.000Z"
}
```

**Database connectivity:**
```bash
docker exec pdfify-mongo-1 mongosh --eval "db.adminCommand('ping')"
```

---

## Important Notes for AI Assistants

### Code Modification Guidelines

1. **Always read existing files before editing**
   - Use Read tool first to understand current implementation
   - Preserve existing patterns and conventions

2. **Never commit `.env` files**
   - Already in `.gitignore`
   - Contains sensitive secrets

3. **Maintain encryption for sensitive data**
   - API keys: Always encrypted in database
   - WooCommerce credentials: Always encrypted
   - Shopify tokens: Always encrypted

4. **Preserve authentication middleware order**
   - `authenticate` must come before `dualAuth`
   - Don't skip authentication on sensitive endpoints

5. **Use atomic operations for usage tracking**
   - Always use `$inc` operator for counters
   - Never read-modify-write for usage counts

6. **Follow logging conventions**
   - Use development-only logging pattern
   - Never log sensitive data (API keys, passwords, tokens)

7. **Maintain template consistency**
   - HTML templates return strings
   - Use embedded CSS (no external stylesheets)
   - Include page numbers in footer

8. **Respect plan limits**
   - Check plan type before gating features
   - Use `usageUtils.incrementUsage()` for all PDF generation

9. **Handle errors gracefully**
   - Return JSON errors for API endpoints
   - Return 200 OK for webhook handlers (prevent retries)
   - Log errors with context

10. **Test changes locally**
    - Restart service after code changes
    - Use `./test-local-env.sh` for validation
    - Verify PDF output visually

### Understanding the Codebase

**Start here for different tasks:**

1. **Adding API endpoints** → `app/server/index.js` + `app/server/routes/`
2. **Modifying PDF templates** → `app/templates/`
3. **Database schema changes** → `app/server/models/`
4. **Authentication changes** → `app/server/middleware/`
5. **Usage tracking** → `app/server/utils/usageUtils.js`
6. **PDF compliance** → `app/server/Helpers/pdf-helpers.js`
7. **Shopify integration** → `app/server/routes/shopify/`
8. **WooCommerce integration** → `app/server/routes/woocommerce/`
9. **Frontend changes** → `app/public/`
10. **Translations** → `app/locales/`

### Common Pitfalls to Avoid

1. **Don't bypass authentication**
   - All API endpoints need `authenticate` or `dualAuth`
   - Session-only pages need `authProtect`

2. **Don't use synchronous crypto**
   - Use `bcrypt.hash()` not `bcrypt.hashSync()`
   - Async operations prevent blocking event loop

3. **Don't forget to restart service**
   - Code changes require: `docker compose restart app`
   - Environment changes require restart

4. **Don't assume plan features**
   - Always check `user.planType` before gating features
   - Free users can't access premium templates

5. **Don't skip usage increment**
   - Every PDF generation must call `incrementUsage()`
   - Preview PDFs count against preview limits

6. **Don't hardcode secrets**
   - Use `process.env.VARIABLE_NAME`
   - Never commit credentials

7. **Don't break webhook verification**
   - Shopify: HMAC verification required
   - Stripe: Signature verification required
   - WooCommerce: Domain validation required

8. **Don't modify MongoDB `_id` fields**
   - MongoDB manages `_id` automatically
   - Never set `_id` in create/update operations

9. **Don't skip error handling**
   - Wrap async operations in try-catch
   - Return meaningful error messages

10. **Don't use external resources in templates**
    - Embed all CSS inline
    - Use base64 for images or local paths
    - Puppeteer can't fetch external URLs in templates

### File Modification Checklist

**Before editing a file:**
- [ ] Read current file content
- [ ] Understand existing patterns
- [ ] Check for dependencies (imports/exports)
- [ ] Note encryption/security concerns

**After editing a file:**
- [ ] Verify syntax (ESLint if available)
- [ ] Restart service if needed
- [ ] Test changed functionality
- [ ] Check logs for errors
- [ ] Verify no sensitive data exposed

### Getting Help

**Documentation resources:**
1. **QUICK-START.md** - Quick reference
2. **.context/api-reference.md** - API documentation
3. **.context/architecture.md** - System architecture
4. **.context/development-guide.md** - Development workflows
5. **.context/compliance-guide.md** - PDF/A & ZUGFeRD
6. **.context/wsl-docker-setup.md** - Local setup details
7. **This file (CLAUDE.md)** - AI assistant guide

**Useful commands:**
```bash
# View documentation
cat QUICK-START.md
cat .context/api-reference.md

# Check service status
docker compose ps

# View logs
docker compose logs -f app

# Test environment
./test-local-env.sh

# Access database
docker exec -it pdfify-mongo-1 mongosh pdfify

# Access container
docker exec -it pdfify-app-1 bash
```

---

## Quick Reference

### Essential Environment Variables

```env
MONGODB_URI=mongodb://mongo:27017/pdfify
SESSION_SECRET=<random>
JWT_SECRET=<random>
ENCRYPTION_KEY=<32 chars>
STRIPE_SECRET_KEY=sk_...
NODE_ENV=development|production
BASE_URL=http://localhost:3002
```

### Key NPM Scripts

```json
"start": "node server/index.js",
"dev": "nodemon server/index.js",
"validate:pdf": "node validate-pdfa.js",
"test:xmp": "node test/embed-xmp-test.js"
```

### Common API Endpoints

```
POST /api/generate-invoice        - Core PDF generation
POST /api/generate-pdf-from-html  - HTML → PDF
POST /api/shopify/invoice          - Shopify invoice
POST /api/woocommerce/invoice      - WooCommerce invoice
POST /api/friendly/generate        - Friendly mode templates
POST /login                        - User login
POST /user-creation                - User registration
GET  /user-dashboard               - User dashboard (session)
```

### Database Collections

```
users         - User accounts, auth, integrations
shopconfigs   - Per-shop configuration
sessions      - Express session store
```

### Docker Services

```
app            - Node.js Express (port 3002 → 3000)
mongo          - MongoDB 5.0 (port 27017)
python-service - Flask/factur-x (port 5000)
```

---

## Conclusion

PDFify is a **production-ready, enterprise-grade PDF generation platform** with:

✅ Clean separation of concerns (models, middleware, routes, helpers)
✅ Dual authentication (API key + session) for flexibility
✅ Encryption throughout (sensitive data protection)
✅ Standards compliance (PDF/A-3b, ZUGFeRD for enterprise)
✅ E-commerce integrations (Shopify webhooks + WooCommerce REST API)
✅ Usage metering (atomic MongoDB operations, plan limits)
✅ Multilingual support (i18n with fallbacks)
✅ No-code UI (Friendly Mode for non-developers)

**For AI Assistants:**
- Always read files before editing
- Preserve encryption and authentication patterns
- Use atomic operations for usage tracking
- Test changes locally before committing
- Follow existing conventions and patterns
- Never expose sensitive data in logs or responses

**Questions?** Check `.context/` documentation or `QUICK-START.md` for additional guidance.

---

**Last Updated:** 2025-11-18
**Maintained by:** PDFify Development Team
**License:** Apache License 2.0
