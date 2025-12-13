# 📄 PDFify API

**PDFify** is an enterprise-grade PDF generation service. This repository showcases a powerful, pure Node.js engine that transforms Shopify order data into **standards-compliant merchant invoices**.

The key innovation is the creation of **PDF/A-3b** and **ZUGFeRD 2.3** compliant invoices using only Node.js libraries, removing the need for external dependencies like headless browsers or Java for the core compliance workflow.

---

## 🚀 Core Feature: Standards-Compliant Invoice Generation

This engine specializes in converting raw Shopify order data into professional, machine-readable invoices suitable for long-term archival and automated B2B processing.

-   ✅ **Pure Node.js Solution:** Generates complex PDFs without relying on external binaries or headless browsers.
-   ✅ **PDF/A-3b Compliance:** Creates PDFs that meet the ISO 19005-3 standard for long-term electronic document preservation.
-   ✅ **ZUGFeRD 2.3 E-Invoicing:** Embeds a structured XML invoice directly within the PDF, making it a "hybrid" document that can be read by both humans and machines.
-   ✅ **Dynamic & On-the-Fly:** Generates documents in real-time via API calls.

---

## 🧰 Tech Stack & Key Modules

The compliance engine is powered by a carefully selected stack of JavaScript libraries, demonstrating a sophisticated approach to PDF manipulation in Node.js.

**Core Libraries:**
-   **`pdf-lib`**: The foundation of the engine. Used for low-level, programmatic creation of the PDF document structure, text, graphics, and font embedding.
-   **`xmlbuilder2`**: Creates the structured ZUGFeRD 2.3 XML data from Shopify order information.
-   **`fontkit`**: Handles font subsetting and embedding, a critical requirement for PDF/A compliance.

**Key Application Modules:**
-   `app/server/routes/shopify/`: This directory contains the primary business logic.
    -   `shopifyApiRoutes.js`: Exposes the API endpoint that receives an order ID.
    -   `shopifyMerchantTemplate.js`: The core template that uses `pdf-lib` to draw the invoice layout, text, and tables from scratch. It also orchestrates data mapping.
    -   `shopifyHelpers.js`: Includes the logic to fetch order data and the store's logo directly from the Shopify API.
-   `app/server/xml/generateZugferdXml.js`: A dedicated module responsible for transforming a JSON order object into a fully compliant ZUGFeRD 2.3 XML string.
-   `app/server/Helpers/pdf-helpers.js`: The heart of the compliance engine. This crucial helper takes a `pdf-lib` document and performs the final steps to achieve compliance:
    1.  Embeds an ICC color profile for consistent color reproduction.
    2.  Adds the required XMP metadata to identify the document as PDF/A-3b and ZUGFeRD-compatible.
    3.  Attaches and embeds the generated ZUGFeRD XML file into the PDF structure.

---

## 🚧 Source Code

This repository is for **public showcase purposes only**.

📩 Interested in a demo, technical deep-dive, or collaboration? → Reach out!

---

© **Lidija Jokić** – Built with care, for modern document automation