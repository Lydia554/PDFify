# PDFify - Project Overview

## What is PDFify?

PDFify is a production-ready, enterprise-grade PDF generation service and API platform that transforms structured data (JSON, HTML, CSV) into beautifully styled, standards-compliant PDF documents.

### Primary Use Cases

- **Customer-facing invoices** with branding, logos, and professional styling
- **Tax-compliant merchant invoices** (PDF/A-3b with ZUGFeRD XML embedding)
- **E-commerce integrations** for Shopify & WooCommerce stores
- **Receipts, packing slips, therapy reports, recipes** and custom documents
- **Bulk document generation** with ZIP exports

### Target Audiences

1. **Developers**: Full REST API with granular control (Developer Mode)
2. **Non-technical users**: Pre-built templates with user-friendly UI (Friendly Mode)

## Core Value Propositions

### 1. Compliance-First Design
- **PDF/A-3b** archival standard support
- **ZUGFeRD 2.1.1** EN16931 embedded invoices
- Tax authority compatible output
- Long-term archival compliance

### 2. E-commerce Native
- Real-time Shopify webhook integration
- WooCommerce REST API support
- Automatic order-to-invoice conversion
- Bulk exports by date range

### 3. Dual-Mode Operation
- **Developer Mode**: Full API control with custom templates
- **Friendly Mode**: Form-based template selection

### 4. Enterprise Features
- Multi-tenant architecture
- Usage tracking and rate limiting
- Tiered subscription model (Free/Premium/Pro)
- Encrypted credential storage
- Internationalization (EN/DE/SL)

## Technical Architecture

### Multi-Service Design
```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Node.js API   │────▶│   MongoDB    │     │ Python Service  │
│  (Express.js)   │     │  (Sessions)  │     │  (ZUGFeRD)      │
│                 │     │  (Users)     │     │                 │
│  • REST API     │     │  (Configs)   │     │  • factur-x     │
│  • Puppeteer    │     │              │     │  • Flask        │
│  • Ghostscript  │     │              │     │                 │
└─────────────────┘     └──────────────┘     └─────────────────┘
         │                                            ▲
         └────────────────────────────────────────────┘
              HTTP POST (PDF + metadata)
```

### Key Technologies
- **Backend**: Node.js, Express.js, MongoDB
- **PDF Generation**: Puppeteer, pdf-lib, Ghostscript
- **Compliance**: factur-x (Python), xmlbuilder2, XMP metadata
- **Payments**: Stripe subscriptions & token packs
- **Auth**: JWT, bcrypt, AES-256-CBC encryption
- **E-commerce**: Shopify Webhooks, WooCommerce REST API
- **Deployment**: Docker Compose, GitHub Actions CI/CD

## Monetization Model

### Tiers

| Feature | Free | Premium | Pro |
|---------|------|---------|-----|
| Monthly Pages | 30 | Higher limit | Higher limit |
| Logo Upload | ✗ | ✓ | ✓ |
| Custom Branding | ✗ | ✓ | ✓ |
| PDF/A-3b Compliance | ✗ | ✗ | ✓ |
| ZUGFeRD Embedding | ✗ | ✗ | ✓ |
| Token Packs | ✗ | ✓ | ✓ |

### Revenue Streams
1. **Subscriptions**: Monthly recurring via Stripe
2. **Token Packs**: One-time purchases (1000/5000/10000 pages)
3. **E-commerce Add-on**: Premium for Shopify/WooCommerce users

## Project Stats

- **Total Files**: 71+ (HTML, JS, JSON)
- **JavaScript Files**: 47
- **API Endpoints**: 40+ across 17 route files
- **Languages**: 3 (English, German, Slovenian)
- **Dependencies**: 48 npm packages
- **Docker Services**: 3 (Node, Mongo, Python)

## Repository Information

- **Copyright**: © 2025 Lidija Jokić
- **License**: Apache License 2.0
- **Purpose**: Public showcase (not for commercial redistribution)
- **Deployment**: Automated via GitHub Actions
