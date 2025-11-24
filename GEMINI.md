# PDFify Project Documentation (GEMINI.md)

**Last Updated:** 2025-11-22

This document provides a comprehensive overview of the PDFify project, its architecture, and development workflows. It is intended for developers and contributors to the project.

---

## Table of Contents

1.  [Project Overview](#1-project-overview)
    -   [What is PDFify?](#what-is-pdfify)
    -   [Core Features](#core-features)
    -   [Tech Stack](#tech-stack)
2.  [Getting Started](#2-getting-started)
    -   [Prerequisites](#prerequisites)
    -   [Local Setup](#local-setup)
    -   [Key Access Points](#key-access-points)
3.  [Architecture](#3-architecture)
    -   [System Diagram](#system-diagram)
    -   [Database Models](#database-models)
4.  [Application Structure](#4-application-structure)
5.  [Core Concepts](#5-core-concepts)
    -   [Authentication](#authentication)
    -   [PDF Generation Workflow](#pdf-generation-workflow)
    -   [Usage Tracking](#usage-tracking)
    -   [Compliance (PDF/A & ZUGFeRD)](#compliance-pdfa--zugferd)
6.  [Development Guide](#6-development-guide)
    -   [Common Commands](#common-commands)
    -   [Adding a New API Endpoint](#adding-a-new-api-endpoint)
    -   [Modifying a PDF Template](#modifying-a-pdf-template)
7.  [Testing](#7-testing)
8.  [Deployment](#8-deployment)

---

## 1. Project Overview

### What is PDFify?

PDFify is a production-ready, enterprise-grade PDF generation service. It transforms structured data (JSON, HTML) into professionally styled, standards-compliant PDF documents. The service is designed as a multi-tenant SaaS application, serving both developers via a REST API and non-technical users through pre-built templates and integrations.

### Core Features

-   **PDF Generation:** Convert JSON data or raw HTML to PDF.
-   **E-commerce Integrations:** Built-in support for Shopify and WooCommerce.
-   **Compliance:** Generates PDF/A-3b compliant documents for long-term archiving and embeds ZUGFeRD 2.3 XML for electronic invoicing.
-   **Multi-tenancy:** User accounts, subscription tiers (Free, Premium, Pro), and API key management.
-   **Usage Metering:** Tracks PDF generation usage against plan limits.
-   **Internationalization:** Support for English, German, and Slovenian.

### Tech Stack

-   **Backend:** Node.js (v20), Express.js
-   **Database:** MongoDB 5.0
-   **PDF Engine:** Puppeteer (Headless Chrome)
-   **Authentication:** JWT for API access, sessions for web clients.
-   **Security:** Passwords areunknown
 hashed with bcrypt, and sensitive data (API keys, integration tokens) are encrypted using AES-256-CBC.
-   **Deployment:** Docker Compose for local development and containerized deployments.

> **Note:** A `python-service` is defined in `docker-compose.yml`, but it is **not used**. The project was simplified to use a pure Node.js solution.

---

## 2. Getting Started

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
    This script will generate a `.env` file, create necessary directories, build Docker images, and start the services.
4.  **Verify the setup:**
    ```bash
    ./test-local-env.sh
    ```
    This will run a series of tests to ensure all components are working correctly.

### Key Access Points

-   **Landing Page:** `http://localhost:3002/`
-   **User Dashboard:** `http://localhost:3002/user-dashboard.html`
-   **API Base URL:** `http://localhost:3002/api`
-   **MongoDB:** Connect on `localhost:27017`

---

## 3. Architecture

### System Diagram

The application runs as a set of containerized services orchestrated by Docker Compose.

```
┌──────────────────────────────────────────────────┐
│              Docker Compose Network              │
│                                                  │
│  ┌──────────────┐      ┌──────────────┐          │
│  │   Node.js    │──────▶│   MongoDB    │          │
│  │  (Express)   │      │   (Database)   │          │
│  │  Port: 3000  │      │  Port: 27017   │          │
│  └──────┬───────┘      └──────────────┘          │
│         │                                        │
│         │ (Handles all logic)                    │
│         │                                        │
│  ───────┴────────────────────────────           │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Database Models

The application uses Mongoose to model data in MongoDB.

-   **`User` (`app/server/models/User.js`):** The core model for user accounts. It stores authentication details, subscription information, integration credentials (encrypted), and usage data.
-   **`ShopConfig` (`app/server/models/ShopConfig.js`):** Stores per-shop configurations for multi-tenant deployments.

---

## 4. Application Structure

The main application code resides in the `app/` directory.

```
app/
├── server/               # NODE.JS BACKEND
│   ├── index.js          # Main entry point - Mounts all routes
│   ├── routes/           # API endpoint definitions
│   │   ├── invoiceRoutes.js  # Core PDF generation logic
│   │   ├── shopify/        # Shopify integration routes
│   │   └── woocommerce/    # WooCommerce integration routes
│   ├── models/           # Mongoose schemas (User.js, ShopConfig.js)
│   ├── middleware/       # Express middleware (e.g., authentication)
│   ├── Helpers/          # PDF/A and ZUGFeRD compliance helpers
│   └── utils/            # Utility functions (e.g., usage tracking)
├── templates/            # PDF TEMPLATES (HTML generation functions)
│   ├── english.js        # Standard invoice template
│   └── english-pro-compliant.js # PDF/A compliant invoice template
├── public/               # Frontend static assets (HTML, JS, CSS)
├── locales/              # i18n JSON files for translations
└── package.json          # Project dependencies
```

---

## 5. Core Concepts

### Authentication

The application supports two primary methods of authentication, managed by middleware:

1.  **API Key (`authenticate.js`):** For programmatic access. The API key is passed as a Bearer token in the `Authorization` header.
2.  **Session (`authProtect.js`):** For web clients. A session is created upon login.
3.  **Dual Auth (`dualAuth.js`):** For endpoints that need to support both methods. It checks for an API key first and falls back to a session.

### PDF Generation Workflow

1.  **Request:** An authenticated request is made to an endpoint like `/api/generate-invoice`.
2.  **Usage Check:** The system verifies if the user is within their plan's usage limits.
3.  **Template Selection:** A template is chosen based on the user's plan and request parameters (e.g., `english-pro-compliant.js` for `pro` users requesting compliance).
4.  **HTML Generation:** The template function generates an HTML string from the provided data.
5.  **Puppeteer:** A headless Chrome instance renders the HTML into a PDF buffer.
6.  **Compliance (Pro Plan):** If requested, XMP metadata and ZUGFeRD XML are embedded into the PDF to meet PDF/A-3b and e-invoicing standards.
7.  **Response:** The generated PDF is returned in the HTTP response.

### Usage Tracking

-   Usage is tracked in the `User` model (`usageCount`, `previewCount`).
-   Limits are defined in `app/server/utils/usageUtils.js` based on subscription plans.
-   To prevent race conditions, usage is incremented using atomic MongoDB `$inc` operations, managed by the `incrementUsage()` utility.
-   Usage counters are automatically reset on the first of each month.

### Compliance (PDF/A & ZUGFeRD)

-   This is a **Pro plan feature**.
-   **PDF/A-3b:** Ensures the PDF is a valid archivable document.
-   **ZUGFeRD:** An XML invoice is embedded within the PDF, making it a "hybrid" document suitable for automated processing.
-   The core logic is handled in `app/server/Helpers/pdf-helpers.js`.

---

## 6. Development Guide

### Common Commands

-   **Start services in detached mode:** `docker compose up -d`
-   **Stop all services:** `docker compose down`
-   **Restart the Node.js app after code changes:** `docker compose restart app`
-   **View logs for the Node.js app:** `docker compose logs -f app`
-   **Access the Node.js container's shell:** `docker exec -it pdfify-app-1 bash`
-   **Access the MongoDB shell:** `docker exec -it pdfify-mongo-1 mongosh pdfify`

### Adding a New API Endpoint

1.  **Create the Route:** Add a new file or modify an existing one in `app/server/routes/`. Define your router and logic.
2.  **Apply Middleware:** Protect your endpoint with the appropriate authentication middleware.
3.  **Mount the Route:** In `app/server/index.js`, import your route file and mount it using `app.use()`.
4.  **Restart & Test:** Run `docker compose restart app` and test your endpoint.

### Modifying a PDF Template

1.  **Locate the Template:** Templates are in `app/templates/`. They are JavaScript files that export a function to generate HTML.
2.  **Edit the HTML:** Modify the HTML string returned by the function. You can use template literals to inject data.
3.  **Restart & Test:** Run `docker compose restart app` and call a PDF generation endpoint to see your changes.

---

## 7. Testing

The project includes a comprehensive test script to validate the local environment.

```bash
./test-local-env.sh
```

This script checks:
-   Docker service status
-   Database connectivity
-   API functionality
-   PDF generation

For manual testing, you can use `curl` or a tool like Postman to make requests to the API. The `test-local-env.sh` script provides example `curl` commands.

---

## 8. Deployment

The application is designed to be deployed as a set of Docker containers.

-   **Build Images:** `docker compose build`
-   **Run in Production:** Use a production-ready `docker-compose.yml` (you may need to create one) and ensure all necessary environment variables are set.
-   **CI/CD:** The `.github/workflows/deploy.yml` file provides an example of a deployment workflow using GitHub Actions.

**Essential Production Environment Variables:**
-   `MONGODB_URI`
-   `SESSION_SECRET`
-   `JWT_SECRET`
-   `ENCRYPTION_KEY`
-   `STRIPE_SECRET_KEY` and other Stripe variables
-   `NODE_ENV=production`
-   `BASE_URL`
