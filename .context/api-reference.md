# PDFify - API Reference

## Base URL

```
http://localhost:3000/api
```

## Authentication

PDFify supports two authentication methods:

### 1. API Key (for programmatic access)

**Header**:
```
x-api-key: your_encrypted_api_key
```

**Query Parameter** (alternative):
```
GET /api/endpoint?api_key=your_encrypted_api_key
```

### 2. Session (for dashboard/UI)

**Cookie-based** session management via `express-session`

## Core API Endpoints

### Developer Mode - PDF Generation

#### Generate Invoice(s)

**Endpoint**: `POST /api/generate-invoice`

**Authentication**: API Key required

**Request Body**:
```json
{
  "template": "english" | "english-pro-compliant",
  "language": "en" | "de" | "sl",
  "compliant": true,
  "preview": false,
  "requests": [
    {
      "data": {
        "invoiceNumber": "INV-2025-001",
        "invoiceDate": "2025-11-02",
        "seller": {
          "name": "Company Ltd.",
          "address": "123 Street",
          "city": "City",
          "postalCode": "12345",
          "country": "Germany",
          "taxId": "DE123456789",
          "email": "info@company.com"
        },
        "buyer": {
          "name": "Customer GmbH",
          "address": "456 Avenue",
          "city": "Berlin",
          "postalCode": "10115",
          "country": "Germany"
        },
        "items": [
          {
            "description": "Product A",
            "quantity": 2,
            "unitPrice": 100.00,
            "vatRate": 19,
            "total": 200.00
          }
        ],
        "subtotal": 200.00,
        "vatAmount": 38.00,
        "total": 238.00,
        "currency": "EUR"
      }
    }
  ]
}
```

**Response** (single PDF):
```json
{
  "success": true,
  "pdf": "base64_encoded_pdf_data",
  "metadata": {
    "pages": 1,
    "size": 45678,
    "compliant": true,
    "zugferdAttached": true
  },
  "usage": {
    "pagesUsed": 1,
    "remainingPages": 29
  }
}
```

**Response** (batch with ZIP):
```json
{
  "success": true,
  "zip": "base64_encoded_zip_data",
  "filename": "invoices_20251102.zip",
  "count": 5,
  "totalPages": 7,
  "usage": {
    "pagesUsed": 7,
    "remainingPages": 23
  }
}
```

**Usage Notes**:
- `preview: true` does NOT count against usage limits
- `compliant: true` requires Pro plan
- Batch processing: Multiple objects in `requests[]` array
- Page count tracked per user

---

### Friendly Mode - Template-Based Generation

#### Generate from Template

**Endpoint**: `POST /api/friendly/generate`

**Authentication**: Session required

**Request Body**:
```json
{
  "templateType": "invoice" | "invoice-premium" | "recipe" | "recipe-premium",
  "language": "en" | "de" | "sl",
  "data": {
    "title": "Invoice #12345",
    "date": "2025-11-02",
    "seller": "Company Name\n123 Street\nCity, 12345",
    "buyer": "Customer Name\n456 Avenue\nBerlin, 10115",
    "items": "Product A, 2, 100.00\nProduct B, 1, 50.00",
    "subtotal": "250.00",
    "vat": "47.50",
    "total": "297.50",
    "logo": "https://example.com/logo.png"
  }
}
```

**Response**:
```json
{
  "success": true,
  "pdf": "base64_encoded_pdf",
  "pagesUsed": 1,
  "remainingPages": 29
}
```

**CSV-like Item Parsing**:
```
"Product A, 2, 100.00"  → {description: "Product A", quantity: 2, price: 100.00}
```

---

## Shopify Integration

### Generate Invoice from Order

**Endpoint**: `POST /api/shopify/invoice`

**Authentication**: API Key

**Request Body**:
```json
{
  "orderId": "gid://shopify/Order/1234567890",
  "shopDomain": "mystore.myshopify.com",
  "invoiceType": "customer" | "merchant",
  "language": "en"
}
```

**Response**:
```json
{
  "success": true,
  "pdf": "base64_encoded_pdf",
  "invoiceNumber": "INV-2025-001",
  "pages": 2
}
```

### Fetch Orders

**Endpoint**: `POST /api/shopify/fetch-orders`

**Authentication**: API Key

**Request Body**:
```json
{
  "shopDomain": "mystore.myshopify.com",
  "startDate": "2025-01-01",
  "endDate": "2025-01-31"
}
```

**Response**:
```json
{
  "success": true,
  "orders": [
    {
      "id": "gid://shopify/Order/1234567890",
      "orderNumber": "1001",
      "createdAt": "2025-01-15T10:30:00Z",
      "totalPrice": "297.50",
      "customer": {
        "email": "customer@example.com",
        "name": "John Doe"
      }
    }
  ],
  "count": 15
}
```

### Bulk Invoice Generation

**Endpoint**: `POST /api/shopify/generate-invoices`

**Authentication**: API Key

**Request Body**:
```json
{
  "shopDomain": "mystore.myshopify.com",
  "orderIds": [
    "gid://shopify/Order/123",
    "gid://shopify/Order/456"
  ],
  "invoiceType": "merchant",
  "language": "de"
}
```

**Response**:
```json
{
  "success": true,
  "zip": "base64_encoded_zip",
  "filename": "shopify_invoices_20251102.zip",
  "count": 2,
  "totalPages": 4
}
```

### Configure Store

**Endpoint**: `POST /api/shopify/store`

**Authentication**: Session required

**Request Body**:
```json
{
  "shopDomain": "mystore.myshopify.com",
  "apiKey": "your_shopify_api_key",
  "accessToken": "shpat_your_access_token",
  "customization": {
    "logoUrl": "https://example.com/logo.png",
    "primaryColor": "#FF6B35",
    "invoicePrefix": "INV-",
    "language": "en"
  }
}
```

**Response**:
```json
{
  "success": true,
  "message": "Store configured successfully",
  "configId": "64f1a2b3c4d5e6f7g8h9i0j1"
}
```

---

## WooCommerce Integration

### Generate Invoice from Order

**Endpoint**: `POST /api/woocommerce/invoice`

**Authentication**: API Key

**Request Body**:
```json
{
  "orderId": 12345,
  "storeDomain": "mystore.com",
  "invoiceType": "customer" | "merchant",
  "language": "en"
}
```

**Response**: Same as Shopify invoice response

### Connect Store

**Endpoint**: `POST /api/woocommerce/store`

**Authentication**: Session required

**Request Body**:
```json
{
  "storeDomain": "mystore.com",
  "consumerKey": "ck_your_consumer_key",
  "consumerSecret": "cs_your_consumer_secret",
  "customization": {
    "logoUrl": "https://example.com/logo.png",
    "primaryColor": "#96588A"
  }
}
```

---

## Authentication Endpoints

### Register User

**Endpoint**: `POST /api/auth/register`

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "secure_password"
}
```

**Response**:
```json
{
  "success": true,
  "message": "User created successfully",
  "apiKey": "encrypted_api_key_string",
  "userId": "64f1a2b3c4d5e6f7g8h9i0j1"
}
```

### Login

**Endpoint**: `POST /api/auth/login`

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "secure_password"
}
```

**Response**:
```json
{
  "success": true,
  "token": "jwt_token_string",
  "user": {
    "email": "user@example.com",
    "planType": "free",
    "usage": 5,
    "maxUsage": 30
  }
}
```

### Password Reset Request

**Endpoint**: `POST /api/auth/forgot-password`

**Request Body**:
```json
{
  "email": "user@example.com"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Password reset email sent"
}
```

---

## Payment Endpoints

### Create Checkout Session

**Endpoint**: `POST /api/payment/checkout`

**Authentication**: Session required

**Request Body**:
```json
{
  "plan": "premium" | "pro",
  "interval": "month" | "year"
}
```

**Response**:
```json
{
  "success": true,
  "sessionId": "cs_test_stripe_session_id",
  "url": "https://checkout.stripe.com/pay/cs_test_..."
}
```

### Purchase Token Pack

**Endpoint**: `POST /api/payment/tokens`

**Authentication**: Session required

**Request Body**:
```json
{
  "pack": "1000" | "5000" | "10000"
}
```

**Response**:
```json
{
  "success": true,
  "sessionId": "cs_test_...",
  "amount": 4999,
  "pages": 1000
}
```

### Stripe Webhook Handler

**Endpoint**: `POST /api/stripe/webhook`

**Headers**:
```
stripe-signature: webhook_signature
```

**Events Handled**:
- `checkout.session.completed` - Activate subscription/add tokens
- `invoice.payment_succeeded` - Renew subscription
- `customer.subscription.deleted` - Downgrade to free tier

---

## User Dashboard Endpoints

### Get User Info

**Endpoint**: `GET /api/user/me`

**Authentication**: Session required

**Response**:
```json
{
  "success": true,
  "user": {
    "email": "user@example.com",
    "planType": "premium",
    "usage": 15,
    "maxUsage": 100,
    "subscriptionStatus": "active",
    "apiKey": "encrypted_key_visible_to_user"
  }
}
```

### Update User Settings

**Endpoint**: `PUT /api/user/settings`

**Authentication**: Session required

**Request Body**:
```json
{
  "defaultLanguage": "de",
  "emailNotifications": true
}
```

---

## Error Responses

### Standard Error Format

```json
{
  "success": false,
  "error": "Error message description",
  "code": "ERROR_CODE"
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_API_KEY` | 401 | API key missing or invalid |
| `UNAUTHORIZED` | 401 | Session expired or not logged in |
| `USAGE_LIMIT_EXCEEDED` | 403 | Monthly page limit reached |
| `FEATURE_NOT_AVAILABLE` | 403 | Feature requires upgrade (e.g., Pro plan) |
| `INVALID_TEMPLATE` | 400 | Template name not recognized |
| `MISSING_REQUIRED_FIELD` | 400 | Required data field missing |
| `ORDER_NOT_FOUND` | 404 | Shopify/WooCommerce order not found |
| `STORE_NOT_CONFIGURED` | 400 | E-commerce store not connected |
| `PDF_GENERATION_FAILED` | 500 | Puppeteer/Ghostscript error |
| `COMPLIANCE_FAILED` | 500 | PDF/A-3b validation failed |

---

## Rate Limiting

**Current Implementation**: Usage-based (pages/month)

**Limits by Plan**:
- Free: 30 pages/month
- Premium: Configurable (e.g., 500 pages/month)
- Pro: Configurable (e.g., 1000 pages/month) + token packs

**Preview Mode**: Does NOT count against limits

**Reset**: Monthly on the 1st (via cron job)

---

## Webhooks (Incoming)

### Shopify Order Created

**URL**: `POST /api/shopify/webhook/orders/create`

**Headers**:
```
X-Shopify-Hmac-SHA256: signature
X-Shopify-Shop-Domain: mystore.myshopify.com
```

**Payload**: Shopify Order object (JSON)

### WooCommerce Order Created

**URL**: `POST /api/woocommerce/webhook/order/created`

**Headers**:
```
X-WC-Webhook-Signature: signature
```

**Payload**: WooCommerce Order object (JSON)

---

## Localization

**Supported Languages**: `en`, `de`, `sl`

**Query Parameter**:
```
POST /api/generate-invoice?language=de
```

**Default**: English (`en`)

**Translation Files**:
- Developer Mode: [app/locales/](app/locales/)
- Friendly Mode: [app/locales-friendly/](app/locales-friendly/)
- Shopify: [app/locales-shopify/](app/locales-shopify/)

---

## PDF/A-3b Compliance API

### Requirements
- Pro plan active
- `compliant: true` in request
- Valid ZUGFeRD invoice data

### XMP Metadata Structure
```xml
<rdf:Description rdf:about="">
  <dc:title>Invoice INV-2025-001</dc:title>
  <dc:creator>PDFify</dc:creator>
  <pdfaid:part>3</pdfaid:part>
  <pdfaid:conformance>B</pdfaid:conformance>
  <fx:ConformanceLevel>EXTENDED</fx:ConformanceLevel>
</rdf:Description>
```

### ZUGFeRD XML Attachment
- Standard: EN16931
- Version: 2.1.1
- Filename: `zugferd-invoice.xml`
- Relationship: `/Alternative`

---

## Example: Complete Developer Workflow

```javascript
// 1. Register user
const registerResponse = await fetch('http://localhost:3000/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'dev@example.com',
    password: 'secure_password'
  })
});
const { apiKey } = await registerResponse.json();

// 2. Generate compliant invoice
const invoiceResponse = await fetch('http://localhost:3000/api/generate-invoice', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': apiKey
  },
  body: JSON.stringify({
    template: 'english-pro-compliant',
    language: 'en',
    compliant: true,
    requests: [{
      data: {
        invoiceNumber: 'INV-2025-001',
        invoiceDate: '2025-11-02',
        seller: { /* ... */ },
        buyer: { /* ... */ },
        items: [ /* ... */ ],
        total: 297.50
      }
    }]
  })
});
const { pdf, metadata } = await invoiceResponse.json();

// 3. Save PDF
const buffer = Buffer.from(pdf, 'base64');
fs.writeFileSync('invoice.pdf', buffer);

console.log(`Generated ${metadata.pages} pages, compliant: ${metadata.compliant}`);
```

---

## Python Service (Internal)

**Endpoint**: `POST http://python-service:5000/embed-zugferd`

**Purpose**: Embed ZUGFeRD XML using factur-x library

**Request** (multipart/form-data):
```
pdf: (binary PDF file)
xml: (ZUGFeRD XML string)
```

**Response**: Binary PDF with embedded XML

**Usage**: Called internally by Node.js service, not exposed publicly
