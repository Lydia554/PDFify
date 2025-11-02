# PDFify - Architecture Documentation

## System Architecture

### High-Level Overview

PDFify follows a **microservices architecture** with three primary services orchestrated via Docker Compose:

```
┌──────────────────────────────────────────────────────────────┐
│                     Docker Network (pdf-api-network)          │
│                                                               │
│  ┌─────────────────┐   ┌─────────────┐   ┌────────────────┐ │
│  │   Node.js App   │   │   MongoDB   │   │ Python Service │ │
│  │   (Port 3000)   │   │ (Port 27017)│   │  (Port 5000)   │ │
│  │                 │   │             │   │                │ │
│  │ • Express API   │──▶│ • User DB   │   │ • Flask API    │ │
│  │ • Puppeteer     │   │ • Sessions  │   │ • factur-x     │ │
│  │ • Ghostscript   │   │ • Configs   │   │ • ZUGFeRD      │ │
│  └─────────────────┘   └─────────────┘   └────────────────┘ │
│         │                                         ▲          │
│         └─────────────────────────────────────────┘          │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    External Integrations
                    • Stripe API
                    • Shopify Webhooks
                    • WooCommerce API
                    • Email (Nodemailer)
```

## Application Layers

### 1. Presentation Layer

**Location**: `app/public/`

**Components**:
- 14 HTML pages with Tailwind CSS styling
- Client-side JavaScript for form handling
- API integration via fetch/axios
- Real-time feedback and validation

**Key Pages**:
- [landing.html](app/public/landing.html) - Marketing homepage
- [user-dashboard.html](app/public/user-dashboard.html) - User control panel
- [pdf-generator-demo.html](app/public/pdf-generator-demo.html) - Interactive demo
- [shopify.html](app/public/shopify.html) / [woocommerce.html](app/public/woocommerce.html) - Integration UIs

### 2. API Layer

**Location**: `app/server/routes/`

**Middleware Chain**:
```javascript
Request → CORS → Session → Body Parser → Auth → Route Handler → Response
```

**Route Organization**:
```
app/server/routes/
├── authRoutes.js           # Login, registration, password reset
├── invoiceRoutes.js        # Developer mode PDF generation
├── friendlyMode.js         # Template-based generation
├── paymentRoutes.js        # Stripe checkout
├── stripeRoutes.js         # Webhook handlers
├── shopify/
│   ├── shopifyApiRoutes.js       # Invoice generation
│   ├── shopifyWebhookRoutes.js   # Webhook handling
│   ├── shopifyConfiguration.js   # Store setup
│   └── shopifyOrders.js          # Order fetching
├── woocommerce/
│   ├── woocommerceApiRoutes.js
│   ├── woocommerceWebhookRoutes.js
│   ├── woocommerceConfiguration.js
│   └── woocommerceOrders.js
└── (additional route files)
```

### 3. Business Logic Layer

**Core Workflows**:

#### PDF Generation Pipeline
```
┌────────────┐    ┌──────────────┐    ┌────────────┐    ┌──────────────┐
│ Fetch Data │───▶│ Generate HTML│───▶│ Puppeteer  │───▶│ Post-Process │
│ (API/DB)   │    │ (Template)   │    │ (Render)   │    │ (Metadata)   │
└────────────┘    └──────────────┘    └────────────┘    └──────────────┘
                                                                 │
                  ┌──────────────────────────────────────────────┘
                  ▼
         ┌─────────────────┐
         │ If Pro & Compliant:              │
         │ 1. Embed XMP                     │
         │ 2. Generate ZUGFeRD XML          │
         │ 3. POST to Python service        │
         │ 4. Run Ghostscript validation    │
         │ 5. Return PDF/A-3b               │
         └─────────────────┘
```

#### Authentication Flow
```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Client    │────▶│ dualAuth.js  │────▶│ Route Logic │
│             │     │              │     │             │
│ • JWT Token │     │ Check JWT    │     │ Access      │
│ • API Key   │     │ OR           │     │ Granted     │
│             │     │ Check API Key│     │             │
└─────────────┘     └──────────────┘     └─────────────┘
```

### 4. Data Layer

**Location**: `app/server/models/`

**Models**:

#### User Model ([app/server/models/User.js](app/server/models/User.js))
```javascript
{
  email: String (unique),
  password: String (bcrypt hashed),
  apiKey: String (AES-256 encrypted),
  planType: 'free' | 'premium' | 'pro',
  usage: Number (monthly page count),
  maxUsage: Number,
  stripeCustomerId: String,
  subscriptionStatus: String,
  // ... encryption hooks
}
```

#### ShopConfig Model ([app/server/models/ShopConfig.js](app/server/models/ShopConfig.js))
```javascript
{
  userId: ObjectId,
  platform: 'shopify' | 'woocommerce',
  shopDomain: String,
  apiKey: String (encrypted),
  accessToken: String (encrypted),
  customization: {
    logoUrl: String,
    primaryColor: String,
    // ... branding options
  }
}
```

## Design Patterns

### 1. Template Strategy Pattern

**Purpose**: Support multiple PDF generation strategies

**Implementation**:
```javascript
// Developer Mode Templates
if (mode === 'developer') {
  if (compliant) {
    template = require('./templates/english-pro-compliant.js');
  } else {
    template = require('./templates/english.js');
  }
}

// Friendly Mode Templates
if (mode === 'friendly') {
  const templates = {
    'invoice': require('./templates-friendly-mode/invoice.js'),
    'invoice-premium': require('./templates-friendly-mode/invoice-premium.js'),
    'recipe': require('./templates-friendly-mode/recipe.js'),
    // ...
  };
  template = templates[templateType];
}
```

### 2. Middleware Chain Pattern

**Purpose**: Modular request processing

**Files**:
- [app/server/middleware/authenticate.js](app/server/middleware/authenticate.js) - API key validation
- [app/server/middleware/authProtect.js](app/server/middleware/authProtect.js) - Session protection
- [app/server/middleware/dualAuth.js](app/server/middleware/dualAuth.js) - Combined auth

**Usage**:
```javascript
router.post('/api/generate-invoice',
  authenticate,        // Decrypt & validate API key
  async (req, res) => {
    // User available at req.user
  }
);

router.post('/api/friendly/generate',
  authProtect,         // Require session
  async (req, res) => {
    // Session user available
  }
);
```

### 3. Service Layer Pattern

**Purpose**: Isolate complex PDF operations

**File**: [app/server/Helpers/pdf-helpers.js](app/server/Helpers/pdf-helpers.js)

**Functions**:
```javascript
embedXmp(pdfPath, metadata)           // XMP metadata for PDF/A-3b
generateZugferdXML(invoiceData)       // EN16931 XML generation
embedXmlIntoPdf(pdfPath, xmlPath)     // Attach XML to PDF
makePdfA3b(pdfPath, outputPath)       // Ghostscript validation
```

### 4. Repository Pattern

**Purpose**: Abstract database operations

**Usage**:
```javascript
// Create user with encrypted API key
const user = new User({ email, password, apiKey });
await user.save(); // Hooks auto-encrypt apiKey

// Find and decrypt
const user = await User.findOne({ email });
const decryptedKey = user.decryptApiKey(); // Instance method
```

### 5. Factory Pattern

**Purpose**: Create PDFs based on configuration

**Implementation**:
```javascript
async function createPDF(config) {
  const { type, compliant, data } = config;

  let pdf = await generateBasicPDF(data);

  if (compliant && user.planType === 'pro') {
    pdf = await makeCompliant(pdf);
  }

  if (type === 'batch') {
    return createZIP(pdf);
  }

  return pdf;
}
```

## Data Flow Examples

### Example 1: Developer Mode Invoice Generation

```
1. POST /api/generate-invoice
   Headers: { 'x-api-key': 'encrypted_key' }
   Body: { template: 'english', data: {...}, compliant: true }

2. authenticate.js middleware
   → Decrypt API key with AES-256-CBC
   → Find user in MongoDB
   → Attach req.user

3. invoiceRoutes.js handler
   → Check usage limits
   → Load template (english-pro-compliant.js)
   → Generate HTML with data
   → Puppeteer: HTML → PDF
   → embedXmp() with metadata
   → generateZugferdXML() from invoice data
   → POST to python-service (factur-x embedding)
   → makePdfA3b() via Ghostscript
   → Update user.usage += pageCount

4. Response
   → PDF buffer or download URL
   → Metadata (pages, size, compliant: true)
```

### Example 2: Shopify Webhook → Invoice

```
1. Shopify Order Created Webhook
   → POST /api/shopify/webhook/orders/create
   → Verify HMAC signature

2. shopifyWebhookRoutes.js
   → Extract order data (gid://, items, customer)
   → Find ShopConfig by shop domain
   → Decrypt Shopify API credentials

3. Generate Invoice
   → Determine type (customer vs merchant)
   → Apply store customization (logo, colors)
   → Use appropriate template
   → Generate PDF

4. Delivery
   → Email to customer (if configured)
   → Store in MongoDB (optional)
   → Return 200 OK to Shopify
```

## Security Architecture

### Authentication Methods

**1. API Key Authentication**
```
Client Request → x-api-key header
               → authenticate.js
               → Decrypt with ENCRYPTION_KEY
               → Find user by decrypted key
               → Attach req.user
```

**2. Session Authentication**
```
Client Request → Cookie (connect.sid)
               → express-session
               → Load from MongoStore
               → authProtect.js validates
               → Attach req.user
```

**3. Dual Authentication**
```
dualAuth.js → Try API key first
            → If not present, try session
            → If both fail, 401 Unauthorized
```

### Encryption Strategy

**API Keys**: AES-256-CBC with random IV
```javascript
// Storage format in MongoDB
{
  apiKey: 'iv:encryptedData',  // e.g., "a1b2c3d4:9f8e7d6c5..."
  iv: '...'                     // Random per encryption
}

// Decryption
const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
const decrypted = decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
```

**Passwords**: bcrypt with auto-salting
```javascript
userSchema.pre('save', async function() {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
});
```

### Authorization Levels

```
Public Routes (no auth)
├── POST /api/auth/login
├── POST /api/auth/register
└── GET /landing.html

User Routes (session)
├── GET /api/user/dashboard
├── POST /api/friendly/generate
└── POST /api/stripe/checkout

API Routes (API key)
├── POST /api/generate-invoice
├── POST /api/shopify/invoice
└── POST /api/woocommerce/invoice

Admin Routes (role check)
└── (not implemented in current version)
```

## Scalability Considerations

### Current Bottlenecks

1. **PDF Generation**: CPU-intensive Puppeteer rendering
2. **Ghostscript**: Synchronous PDF/A conversion
3. **MongoDB**: Single instance (no replica set)

### Scaling Strategies

**Horizontal Scaling**:
```
Load Balancer
    ├── Node Instance 1 ──┐
    ├── Node Instance 2 ──┼─→ Shared MongoDB Cluster
    └── Node Instance 3 ──┘
```

**Queue-Based Processing**:
```
API Server → Redis Queue → Worker Nodes → S3 Storage
                              (Puppeteer)
```

**Caching Layer**:
- Template caching (already in memory)
- Redis for session store (instead of MongoDB)
- CDN for static PDFs

## Deployment Architecture

**Docker Compose Setup**:
```yaml
services:
  app:                      # Node.js API
    ports: 3002:3000
    depends_on: [mongo, python-service]

  mongo:                    # MongoDB 5.0
    volumes: [./data:/data/db]

  python-service:           # ZUGFeRD microservice
    ports: 5000:5000
```

**CI/CD Pipeline** ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)):
```
Push to main → GitHub Actions
             → SSH to production
             → git pull
             → docker compose down
             → docker compose up -d --build
             → Automated deployment
```

## Performance Metrics

**PDF Generation Times** (estimated):
- Simple invoice (1 page): ~500ms
- Complex invoice (5 pages): ~1.5s
- PDF/A-3b compliant: +2-3s (Ghostscript overhead)
- Batch (10 invoices): ~8-12s

**Resource Usage**:
- Puppeteer: 200-500MB RAM per instance
- MongoDB: ~50MB RAM (small dataset)
- Python service: ~30MB RAM
