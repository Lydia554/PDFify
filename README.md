# 📄 PDFify API: Enterprise-Grade Document Generation

**PDFify** is a production-ready, enterprise-grade PDF generation service, offering a versatile suite of tools to create a wide range of documents—from standards-compliant e-invoices for E-Commerce to branded recipes and reports. It features a powerful pure Node.js engine for high-compliance documents and a flexible HTML-to-PDF engine for general-purpose use.

This project is a complete, multi-tenant SaaS solution, including user authentication, API key management, subscription plans, and Stripe integration.

---

## ✨ Core Features

PDFify is more than just a single-purpose tool; it's a complete platform with a dual-engine architecture to meet diverse PDF generation needs.

-   ### **Dual PDF Engines**
    -   **🚀 Compliant Engine (`pdf-lib`):** A high-performance, pure Node.js engine for creating standards-compliant documents from scratch. It offers unparalleled control and performance by programmatically building PDFs without external dependencies like headless browsers.
    -   **🌐 Legacy Engine (`puppeteer`):** A flexible engine that renders HTML and CSS into beautiful PDFs using a headless Chrome instance. Ideal for creating visually rich documents from web-standard technologies.

-   ### **E-Commerce Integration**
    -   **🛍️ Shopify:** Deep integration for generating compliant merchant invoices, customer-facing invoices, packing slips, and more directly from order data. Supports bulk-generation and ZIP file creation.
    -   **🛒 WooCommerce:** Connect your WooCommerce store to generate customer invoices and bulk-download them in a ZIP archive.

-   ### **Standards-Compliant E-Invoicing**
    -   **✅ PDF/A-3b Compliance:** Creates PDFs that meet the **ISO 19005-3** standard for long-term electronic document preservation, ensuring your invoices are future-proof.
    -   **✅ ZUGFeRD 2.3 E-Invoicing:** Embeds a structured XML invoice directly within the PDF, creating a "hybrid" document that is both human-readable and machine-parseable for automated B2B and B2G processing.

-   ### **Flexible Generation Modes**
    -   **👩‍⚖️ Compliant Mode:** The flagship feature for generating PDF/A-3b and ZUGFeRD 2.3 merchant invoices for Shopify.
    -   **😊 Friendly Mode:** For non-developers. Generate beautiful PDFs (invoices, recipes) from simple JSON data using pre-built server-side templates. It even includes ZUGFeRD support for Pro plan users!
    -   **Developer Mode:** For developers. Send raw HTML content and get a pixel-perfect PDF back, complete with optional branding and watermarking based on your plan.

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

-   **Backend:** Node.js, Express.js
-   **Database:** MongoDB with Mongoose
-   **PDF Engines:**
    -   **Compliant:** `pdf-lib`, `@pdf-lib/fontkit`
    -   **Legacy:** `puppeteer`
-   **E-Invoicing:** `xmlbuilder2`, `fast-xml-parser`
-   **Authentication:** `jsonwebtoken`, `bcryptjs`, `express-session`
-   **E-Commerce:** `@woocommerce/woocommerce-rest-api` for WooCommerce; `axios`/`node-fetch` for Shopify.
-   **Payments:** `stripe`
-   **Deployment:** Docker Compose


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

© **Lidija Jokić** – Built with care, for modern document automation
