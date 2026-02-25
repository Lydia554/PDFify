# 📄 PDFify API: Enterprise-Grade Document Generation Platform

**PDFify** is a production-ready, enterprise-grade PDF generation platform, offering a versatile suite of tools to create a wide range of documents—from standards-compliant e-invoices for E-Commerce to branded recipes and reports.

## 🎯 Multi-Platform Solution

PDFify is a **complete platform** with multiple ways to generate documents:

- **🌐 [PDFify.pro](https://pdfify.pro)** – Standalone API service for developers and businesses
- **🛍️ [Shopify App]()** – One-click installation for Shopify merchants
- **🛒 WooCommerce Plugin** – Seamless integration for WooCommerce stores
- **🔌 REST API** – Build custom integrations with any platform

This is a complete, multi-tenant SaaS solution, including user authentication, API key management, subscription plans, and Stripe integration.

---

## ✨ Core Features

PDFify is more than just a single-purpose tool; it's a complete platform with a dual-engine architecture to meet diverse PDF generation needs.

-   ### **PDF Generation Architecture**
    -   **☕ Java Service (Apache PDFBox 3.0.3):** Creates PDF/A-3b compliant documents programmatically with proper XMP metadata, ICC profiles, and structure. High-performance microservice running on port 8080.
    -   **📎 pdf-lib:** Embeds ZUGFeRD 2.4 XML attachments into PDFs for German e-invoicing compliance. Used for XML attachment, not PDF creation.
    -   **🌐 Puppeteer:** HTML-to-PDF engine for non-compliant documents (recipes, therapy reports, etc.). Renders HTML/CSS into visual PDFs.

-   ### **E-Commerce Integration**
    -   **🛍️ [Shopify App]():**
        - One-click OAuth installation from Shopify App Store
        - Generate **PDF/A-3b + ZUGFeRD 2.4 compliant** invoices automatically
        - Multi-language support 
        - Custom branding (logos, colors, company details)
        - Bulk download invoices as ZIP
        - Usage tracking per store (Free: 30, Premium: 100, Pro: Unlimited)
        - Perfect for German merchants requiring GoBD compliance

    -   **🛒 WooCommerce:**
        - Connect your WooCommerce store to generate customer invoices
        - Bulk-download invoices in ZIP archive
        - Same ZUGFeRD compliance for EU merchants

-   ### **Standards-Compliant E-Invoicing**
    -   **✅ PDF/A-3b Compliance:** Creates PDFs that meet the **ISO 19005-3** standard for long-term electronic document preservation, ensuring your invoices are future-proof.
    -   **✅ ZUGFeRD 2.4 E-Invoicing:** Embeds a structured XML invoice directly within the PDF, creating a "hybrid" document that is both human-readable and machine-parseable for automated B2B and B2G processing.

-   ### **Flexible Generation Modes**
    -   **👩‍⚖️ Compliant Mode:** PDF/A-3b + ZUGFeRD 2.4 invoices via Java service (Shopify merchant invoices, Pro/Premium plans)
    -   **😊 Friendly Mode:** Generate PDFs from simple JSON using server-side templates (invoices, recipes, therapy reports)
    -   **👨‍💻 Developer Mode:** Send raw HTML and get PDF back via Puppeteer (with branding based on plan)

-   ### **Wide Variety of Templates**
    -   The platform is built to be extensible and supports various document types beyond e-commerce, including:
        -   Invoices
        -   Packing Slips
        -   Shop Orders
        -   Recipes
        -   Therapy Reports
        -   And more...

-   ### **Full-Fledged Platform Features**
    -   **Multi-Tenancy:** Supports multiple user accounts with isolated configurations.
    -   **Authentication:** Secure user and API access via JWT and session management.
    -   **API Key Management:** Users can manage their own API keys.
    -   **Subscription Tiers:** Built-in logic for `free`, `premium`, and `pro` plans with different feature access.
    -   **Billing Integration:** Fully integrated with **Stripe** for handling payments and subscriptions.

---

## 🧰 Tech Stack

### Platform Architecture
-   **API Layer:** Node.js + Express.js (request handling, business logic)
-   **PDF Generation Service:** Java microservice with Apache PDFBox 3.0.3
    -   Programmatic PDF construction (not HTML-to-PDF conversion)
    -   True PDF/A-3b compliance with proper XMP metadata
    -   ZUGFeRD XML embedding for German e-invoicing
    -   High performance: generates PDFs in milliseconds
-   **Database:** MongoDB with Mongoose
-   **PDF Manipulation:** `pdf-lib`, `@pdf-lib/fontkit`
-   **E-Invoicing:** `xmlbuilder2`, `fast-xml-parser` (ZUGFeRD 2.4 XML generation)
-   **Authentication:** `jsonwebtoken`, `bcryptjs`, `express-session`
-   **E-Commerce:**
    -   `@woocommerce/woocommerce-rest-api` for WooCommerce
    -   `axios` for Shopify Admin API & webhooks
-   **Payments:** `stripe`
-   **Deployment:** Docker Compose (multi-stage build with Java compilation)


---

## 🏗️ Project Structure

```
app/
├── server/
│   ├── index.js              # Main application entry point
│   ├── routes/               # API route definitions for each feature
│   │   ├── shopify/          # Shopify-specific logic
│   │   ├── woocommerce/      # WooCommerce-specific logic
│   │   ├── friendlyMode.js   # "No-code" JSON to PDF routes
│   │   └── htmlRoutes.js     # Raw HTML to PDF routes
│   ├── Helpers/
│   │   └── pdf-helpers.js    # Core compliance logic (ZUGFeRD, PDF/A)
│   ├── models/               # Mongoose schemas (User, ShopConfig)
│   ├── middleware/           # Authentication and other middleware
│   └── templates-friendly-mode/ # Server-side templates for Friendly Mode
└── package.json
```

---

## 🔌 API Usage & Endpoints

Authentication is handled via a **Bearer Token** passed in the `Authorization` header. You can get a token by signing up and generating one in the user dashboard.

### Shopify: Compliant Merchant Invoice
Generate a PDF/A-3b and ZUGFeRD 2.3 compliant invoice.

`POST /api/shopify/invoice?merchant=true`
```bash
curl -X POST http://localhost:3002/api/shopify/invoice?merchant=true \
-H "Authorization: Bearer YOUR_API_KEY" \
-H "Content-Type: application/json" \
-d 
'{ "shopDomain": "your-store.myshopify.com", "orderId": "1234567890" }'
```

### WooCommerce: Customer Invoice
Generate a standard customer invoice.

`POST /api/woocommerce/invoice`
```bash
curl -X POST http://localhost:3002/api/woocommerce/invoice \
-H "Authorization: Bearer YOUR_API_KEY" \
-H "Content-Type: application/json" \
-d 
'{ "shopDomain": "your-store.com", "orderId": "1234" }'
```

### Friendly Mode: JSON to PDF
Generate an invoice from simple JSON data using a pre-built template.

`POST /api/friendly/generate`
```bash
curl -X POST http://localhost:3002/api/friendly/generate \
-H "Authorization: Bearer YOUR_API_KEY" \
-H "Content-Type: application/json" \
-d 
'{ "template": "invoice", "orderId": "INV-2025-001", "customerName": "John Doe", "items": "Item 1,1,100\nItem 2,2,50" }'
```

### Developer Mode: Raw HTML to PDF
Generate a PDF directly from an HTML string.

`POST /api/html/generate-pdf-from-html`
```bash
curl -X POST http://localhost:3002/api/html/generate-pdf-from-html \
-H "Authorization: Bearer YOUR_API_KEY" \
-H "Content-Type: application/json" \
-d 
'{ "html": "<h1>Hello, World!</h1><p>This is my PDF.</p>" }'
```

---

## 📹 Demo

**Shopify App Demo:** Watch the PDFify Shopify app in action
[Download Demo Video](https://github.com/user-attachments/assets/e86abb71-9b30-4f8c-a7dd-8e08439c155b)

---

© **Lidija Jokić** – Built with care, for modern document automation

---

## 🚀 Deployment Update
**Latest deployment:** 2026-02-13 18:28:16 - Updated GitHub Actions workflow with increased timeout settings for Docker build (50m command_timeout).
