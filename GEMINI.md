# PDFify Project Documentation (GEMINI.md)

**Last Updated:** 2025-12-13

This document provides a comprehensive overview of the PDFify project, its architecture, and development workflows. It is intended for developers and contributors to the project.

---

## 1. Project Overview

### What is PDFify?

PDFify is a production-ready, enterprise-grade PDF generation service. It has recently been refactored to include a powerful **pure Node.js engine** for creating highly-compliant merchant invoices directly from Shopify order data. While it retains legacy capabilities for HTML-to-PDF conversion, its core innovation is now the programmatic generation of standards-compliant e-invoices.

### Core Features

-   **Standards-Compliant PDF Generation:** The flagship feature is the creation of professional merchant invoices that adhere to strict European e-invoicing and archival standards.
-   **PDF/A-3b Compliance:** Generates PDF documents that meet the ISO 19005-3 standard, ensuring they are suitable for long-term electronic archiving.
-   **ZUGFeRD 2.3 E-Invoicing:** Embeds a structured ZUGFeRD 2.3 XML invoice within the PDF, creating a "hybrid" document that is both human-readable and machine-parseable for automated processing.
-   **Shopify Integration:** Fetches order data and store branding (logo) directly from the Shopify API to generate invoices.
-   **Multi-tenancy:** Supports multiple user accounts, subscription tiers, and API key management.
-   **Legacy PDF Generation:** Retains older modules for converting raw JSON or HTML to PDF using a headless browser.

### Tech Stack

-   **Backend:** Node.js (v20), Express.js
-   **Database:** MongoDB 5.0
-   **Compliant PDF Engine:** **`pdf-lib`** is the core of the new merchant invoice system, used for programmatic PDF creation. It is complemented by `fontkit` for font embedding and `xmlbuilder2` for creating the ZUGFeRD XML.
-   **Legacy PDF Engine:** **Puppeteer** (Headless Chrome) is used for older HTML-to-PDF conversion features.
-   **Authentication:** JWT for API access, sessions for web clients.
-   **Deployment:** Docker Compose for local development.

---

## 2. Getting Started

(This section remains largely unchanged as it pertains to local setup)

### Prerequisites

-   Docker Desktop with WSL 2 (for Windows users)
-   Git

### Local Setup

1.  **Clone the repository.**
2.  **Open a shell in the project root.** (On Windows, use WSL: `wsl`)
3.  **Run the setup script:**
    ```bash
    chmod +x setup-local-env.sh
    ./setup-local-env.sh
    ```
4.  **Verify the setup:**
    ```bash
    ./test-local-env.sh
    ```

---

## 3. Architecture

(This section remains largely unchanged)

---

## 4. Application Structure

The main application code resides in the `app/` directory. The recent refactoring has centralized the new, compliant invoice generation logic in the following key files:

```
app/
├── server/
│   ├── routes/
│   │   ├── shopify/
│   │   │   ├── shopifyApiRoutes.js       # API endpoint for triggering Shopify invoice generation.
│   │   │   ├── shopifyMerchantTemplate.js  # Core invoice template using `pdf-lib` to draw the document.
│   │   │   └── shopifyHelpers.js         # Fetches data (orders, logo) from the Shopify API.
│   │   └── ... (other legacy routes)
│   ├── Helpers/
│   │   └── pdf-helpers.js          # The heart of the compliance engine. Embeds XML, ICC profiles, and XMP metadata.
│   ├── xml/
│   │   └── generateZugferdXml.js # Generates the ZUGFeRD 2.3 XML from order data.
│   ├── models/
│   ├── middleware/
│   └── ...
├── templates/                    # Legacy HTML-based templates (used by Puppeteer).
└── ...
```

---

## 5. Core Concepts

### Authentication

(This section remains unchanged)

### New PDF Generation Workflow (Compliant Merchant Invoice)

The new workflow represents a significant shift from HTML-based rendering to programmatic PDF creation, ensuring maximum control and compliance.

1.  **Request:** An authenticated request hits the `/api/shopify/invoice` endpoint with a Shopify Order ID.
2.  **Data Fetching:** `shopifyHelpers.js` calls the Shopify API to retrieve the full order details. It also attempts to fetch the store's logo from the active theme's assets.
3.  **ZUGFeRD XML Generation:** The order data is passed to `generateZugferdXml.js`, which builds a fully-compliant ZUGFeRD 2.3 XML invoice string.
4.  **Programmatic PDF Creation:** `shopifyMerchantTemplate.js` instantiates a new `pdf-lib` document. It programmatically draws the entire invoice—including headers, text, tables, and totals—onto the page. It does **not** use HTML.
5.  **Compliance Finalization:** The generated `pdf-lib` document and ZUGFeRD XML string are passed to `pdf-helpers.js`. This module performs the critical final steps:
    *   Embeds the required ICC color profile.
    *   Creates and embeds the XMP metadata that identifies the document as conforming to PDF/A-3b and ZUGFeRD 2.3 standards.
    *   Attaches the ZUGFeRD XML file to the PDF with the correct relationship type (`Alternative`).
6.  **Response:** The final, compliant PDF is returned to the user.

### Legacy PDF Generation Workflow

For older features, the application still uses a Puppeteer-based workflow:
1. A template from `app/templates/` generates an HTML string.
2. A headless Chrome instance renders the HTML into a PDF buffer.
3. This method is not used for the new compliant merchant invoices.

---

## 6. Development Guide

### Common Commands

(This section remains unchanged)

### Modifying a PDF Template

The process for modifying a template depends on which type of PDF you are editing.

#### Modifying the Compliant Merchant Invoice

1.  **Locate the Template:** The layout and drawing logic is in `app/server/routes/shopify/shopifyMerchantTemplate.js`.
2.  **Edit with `pdf-lib`:** All content is drawn using `pdf-lib` API calls (e.g., `page.drawText()`, `page.drawLine()`). To change the layout, you must modify the coordinates, text, and drawing commands in this file. There is no HTML involved.
3.  **Restart & Test:** Run `docker compose restart app` and call the Shopify invoice endpoint to see your changes.

#### Modifying a Legacy HTML Template

1.  **Locate the Template:** Legacy templates are in `app/templates/`.
2.  **Edit the HTML:** Modify the HTML string returned by the template function.
3.  **Restart & Test:** Restart the app and call the relevant legacy PDF generation endpoint.

---
(Testing and Deployment sections remain the same)