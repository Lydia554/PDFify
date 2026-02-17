package com.pdfa;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.graphics.color.PDOutputIntent;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.pdfbox.pdmodel.PDDocumentNameDictionary;
import org.apache.pdfbox.pdmodel.PDEmbeddedFilesNameTreeNode;
import org.apache.pdfbox.pdmodel.common.filespecification.PDComplexFileSpecification;
import org.apache.pdfbox.pdmodel.common.filespecification.PDEmbeddedFile;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.cos.COSArray;

import spark.Spark.*;

import java.io.File;
import java.io.IOException;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.net.URL;
import java.util.List;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;

import static spark.Spark.*;

/**
 * HTTP Server for PDF/A-3B Service using Apache PDFBox and Spark Java
 * Creates compliant PDF/A-3b invoices with ZUGFeRD XML embedding
 */
public class HTTPServer {

    private static final Gson gson = new Gson();
    private static final int PORT = 8080;

    public static void main(String[] args) {
        // Configure Spark
        port(PORT);

        // CORS
        before((request, response) -> {
            response.header("Access-Control-Allow-Origin", "*");
            response.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            response.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
            response.type("application/json");
        });

        options("/*", (request, response) -> {
            return "OK";
        });

        // Health check endpoint
        get("/health", (req, res) -> {
            res.type("application/json");
            return gson.toJson(Map.of("status", "ok"));
        });

        // Status endpoint
        get("/status", (req, res) -> {
            res.type("application/json");
            long uptime = java.lang.management.ManagementFactory.getRuntimeMXBean().getUptime();
            return gson.toJson(Map.of(
                "status", "running",
                "version", "1.0.0",
                "uptime", uptime
            ));
        });

        // Create PDF endpoint
        post("/create", (req, res) -> {
            String requestId = "req-" + System.currentTimeMillis();
            long startTime = System.currentTimeMillis();

            try {
                log(requestId, "Received PDF creation request");

                // Parse JSON-RPC request
                JsonObject requestBody;
                try {
                    requestBody = JsonParser.parseString(req.body()).getAsJsonObject();
                } catch (Exception e) {
                    logError(requestId, "Invalid JSON request body", e);
                    res.status(400);
                    res.type("application/json");
                    return createErrorResponse("Invalid JSON: " + e.getMessage());
                }

                String method = requestBody.has("method") ? requestBody.get("method").getAsString() : "";
                JsonObject params = requestBody.has("params") && requestBody.get("params").isJsonObject()
                    ? requestBody.getAsJsonObject("params")
                    : new JsonObject();

                if (!"createPDFA3B".equals(method)) {
                    logError(requestId, "Unknown method: " + method, null);
                    res.status(400);
                    res.type("application/json");
                    return createErrorResponse("Unknown method: " + method);
                }

                // Validate required parameters
                if (params.has("orderId")) {
                    log(requestId, "Creating PDF for order: " + params.get("orderId").getAsString());
                }

                // Create invoice data from params
                InvoiceData invoice = new InvoiceData();
                invoice.orderId = params.has("orderId") ? params.get("orderId").getAsString() : "INV-" + System.currentTimeMillis();
                invoice.date = params.has("date") ? params.get("date").getAsString() : java.time.LocalDate.now().toString();
                invoice.customerName = params.has("customerName") ? params.get("customerName").getAsString() : "Customer";
                invoice.customerEmail = params.has("customerEmail") ? params.get("customerEmail").getAsString() : "";
                invoice.customerAddress = params.has("customerAddress") ? params.get("customerAddress").getAsString() : "";
                invoice.companyName = params.has("companyName") ? params.get("companyName").getAsString() : "Your Company";
                invoice.shopName = params.has("shopName") ? params.get("shopName").getAsString() : "";
                invoice.shopAddress = params.has("shopAddress") ? params.get("shopAddress").getAsString() : "";
                invoice.currency = params.has("currency") ? params.get("currency").getAsString() : "USD";
                invoice.total = params.has("total") ? params.get("total").getAsDouble() : 0.0;
                invoice.vatRate = params.has("vatRate") ? params.get("vatRate").getAsDouble() : 21.0;
                invoice.subtotal = params.has("subtotal") ? params.get("subtotal").getAsDouble() : 0.0;
                invoice.tax = params.has("tax") ? params.get("tax").getAsDouble() : 0.0;
                invoice.iban = params.has("iban") ? params.get("iban").getAsString() : "";
                invoice.bic = params.has("bic") ? params.get("bic").getAsString() : "";
                invoice.paymentTerms = params.has("paymentTerms") ? params.get("paymentTerms").getAsString() : "";
                invoice.creator = params.has("creator") ? params.get("creator").getAsString() : "";

                // Parse locale (for future use)
                if (params.has("locale") && params.get("locale").isJsonObject()) {
                    JsonObject localeObj = params.getAsJsonObject("locale");
                    invoice.locale = localeObj.has("language") ? localeObj.get("language").getAsString() : "en";
                }

                // Parse items
                if (params.has("items") && params.get("items").isJsonArray()) {
                    invoice.items = new ArrayList<>();
                    params.getAsJsonArray("items").forEach(item -> {
                        JsonObject itemObj = item.getAsJsonObject();
                        LineItem line = new LineItem();
                        line.position = itemObj.has("position") ? itemObj.get("position").getAsInt() : 0;
                        line.name = itemObj.has("name") ? itemObj.get("name").getAsString() : "Item";
                        line.quantity = itemObj.has("quantity") ? itemObj.get("quantity").getAsInt() : 1;
                        line.unitCode = itemObj.has("unitCode") ? itemObj.get("unitCode").getAsString() : "EA";
                        line.price = itemObj.has("price") ? itemObj.get("price").getAsDouble() : 0.0;
                        invoice.items.add(line);
                    });
                } else {
                    invoice.items = new ArrayList<>();
                }

                log(requestId, "Invoice data parsed successfully, items: " + invoice.items.size());

                // Generate PDF to byte array
                byte[] pdfBytes = createPdfA3B(invoice);

                long duration = System.currentTimeMillis() - startTime;
                log(requestId, "PDF created successfully in " + duration + "ms, size: " + pdfBytes.length + " bytes");

                // Return PDF
                res.type("application/pdf");
                res.header("Content-Disposition", "attachment; filename=invoice.pdf");
                return pdfBytes;

            } catch (Exception e) {
                long duration = System.currentTimeMillis() - startTime;
                logError(requestId, "PDF creation failed after " + duration + "ms", e);
                res.status(500);
                res.type("application/json");
                return createErrorResponse(e.getMessage());
            }
        });

        // Wait for server initialization
        awaitInitialization();
        System.out.println("PDF/A-3B Service started on port " + PORT);
        System.out.println("Endpoints:");
        System.out.println("  POST /create  - Create PDF/A-3b invoice");
        System.out.println("  GET  /health - Health check");
        System.out.println("  GET  /status - Service status");
    }

    /**
     * Create PDF/A-3b invoice as byte array with improved design
     */
    private static byte[] createPdfA3B(InvoiceData data) throws IOException {
        try (PDDocument document = new PDDocument()) {
            addOutputIntent(document);
            PDPage page = new PDPage(org.apache.pdfbox.pdmodel.common.PDRectangle.A4);
            document.addPage(page);

            InputStream fontStream = getResourceAsStream("LiberationSans-Regular.ttf");
            PDType0Font font = PDType0Font.load(document, fontStream);

            float pageWidth = org.apache.pdfbox.pdmodel.common.PDRectangle.A4.getWidth();
            float pageHeight = org.apache.pdfbox.pdmodel.common.PDRectangle.A4.getHeight();
            float margin = 50;
            String currencySymbol = getCurrencySymbol(data.currency);
            PDPageContentStream content = new PDPageContentStream(document, page);

            // ========== VIBRANT HEADER ==========
            // Cyan header background
            content.setNonStrokingColor(0.0f, 0.65f, 0.85f);  // Nice cyan
            content.addRect(margin, pageHeight - 75, pageWidth - 2 * margin, 65);
            content.fill();
            content.setNonStrokingColor(1.0f, 1.0f, 1.0f);  // White text

            // INVOICE in white - large and bold
            content.beginText();
            content.setFont(font, 42);
            content.newLineAtOffset(margin + 15, pageHeight - 45);
            content.showText("INVOICE");
            content.endText();

            // Invoice details in white on right side of header
            content.beginText();
            content.setFont(font, 11);
            float headerRightX = pageWidth - margin - 15;
            content.newLineAtOffset(headerRightX - 200, pageHeight - 35);
            content.showText("Invoice No: " + data.orderId);
            content.newLineAtOffset(0, -16);
            content.showText("Date: " + data.date);
            if (data.creator != null && !data.creator.isEmpty()) {
                content.newLineAtOffset(0, -16);
                content.showText(data.creator);
            }
            content.endText();

            content.setNonStrokingColor(0, 0, 0);  // Reset to black

            // ========== FROM SECTION ==========
            float fromY = pageHeight - 110;

            // Large cyan background for FROM section
            content.setNonStrokingColor(0.94f, 0.98f, 1.0f);  // Very light cyan
            content.addRect(margin, fromY - 85, (pageWidth / 2) - margin - 15, 90);
            content.fill();
            content.setNonStrokingColor(0, 0, 0);

            content.beginText();
            content.setFont(font, 10);
            content.newLineAtOffset(margin + 12, fromY);
            content.showText("FROM:");
            content.newLineAtOffset(0, -18);
            content.setFont(font, 12);
            content.showText(data.companyName);
            content.newLineAtOffset(0, -15);
            content.setFont(font, 10);
            if (data.shopName != null && !data.shopName.isEmpty()) {
                content.showText(data.shopName);
                content.newLineAtOffset(0, -13);
            }
            if (data.shopAddress != null && !data.shopAddress.isEmpty()) {
                String[] addr = splitText(data.shopAddress, 55);
                for (String line : addr) {
                    content.showText(line);
                    content.newLineAtOffset(0, -13);
                }
            }
            content.endText();

            // ========== BILL TO SECTION ==========
            // Large cyan background for BILL TO section
            content.setNonStrokingColor(0.94f, 0.98f, 1.0f);  // Very light cyan
            content.addRect(pageWidth / 2 + 15, fromY - 85, (pageWidth / 2) - margin - 15, 100);
            content.fill();
            content.setNonStrokingColor(0, 0, 0);

            content.beginText();
            content.setFont(font, 10);
            float billToX = pageWidth / 2 + 27;
            content.newLineAtOffset(billToX, fromY);
            content.showText("BILL TO:");
            content.newLineAtOffset(0, -18);
            content.setFont(font, 12);
            content.showText(data.customerName);
            content.newLineAtOffset(0, -15);
            content.setFont(font, 10);
            if (data.customerAddress != null && !data.customerAddress.isEmpty()) {
                String[] addr = splitText(data.customerAddress, 55);
                for (String line : addr) {
                    content.showText(line);
                    content.newLineAtOffset(0, -13);
                }
            }
            if (data.customerEmail != null && !data.customerEmail.isEmpty()) {
                content.showText("Email: " + data.customerEmail);
            }
            content.endText();

            // ========== TABLE HEADER WITH COLOR ==========
            float tableTopY = fromY - 95;

            // Cyan colored table header background
            content.setNonStrokingColor(0.85f, 0.96f, 1.0f);  // Light cyan
            content.addRect(margin, tableTopY - 28, pageWidth - 2 * margin, 28);
            content.fill();
            content.setNonStrokingColor(0, 0, 0);

            // Draw thick line above header
            content.setLineWidth(2f);
            content.setStrokingColor(0.0f, 0.65f, 0.85f);  // Nice cyan line
            content.moveTo(margin, tableTopY);
            content.lineTo(pageWidth - margin, tableTopY);
            content.stroke();

            // Column headers with better spacing - all black
            content.beginText();
            content.setFont(font, 11);
            float y = tableTopY - 11;
            content.newLineAtOffset(margin + 12, y);
            content.showText("ITEM");
            content.newLineAtOffset(40, 0);
            content.showText("DESCRIPTION");
            content.newLineAtOffset(250, 0);
            content.showText("QTY");
            content.newLineAtOffset(45, 0);
            content.showText("UNIT");
            content.newLineAtOffset(45, 0);
            content.showText("PRICE");
            content.newLineAtOffset(70, 0);
            content.showText("TOTAL");
            content.endText();

            // ========== TABLE ITEMS ==========
            y = tableTopY - 50;
            int itemCount = 0;

            if (data.items != null && !data.items.isEmpty()) {
                for (LineItem item : data.items) {
                    // Alternating row background with cyan tint
                    if (itemCount % 2 == 0) {
                        content.setNonStrokingColor(0.93f, 0.98f, 1.0f);  // Light cyan tint
                        content.addRect(margin, y - 4, pageWidth - 2 * margin, 30);
                        content.fill();
                        content.setNonStrokingColor(0, 0, 0);
                    }

                    content.beginText();
                    content.setFont(font, 10);
                    content.newLineAtOffset(margin + 12, y);
                    content.showText(String.valueOf(item.position > 0 ? item.position : (itemCount + 1)));
                    content.newLineAtOffset(40, 0);
                    content.showText(truncateText(item.name, 42));
                    content.newLineAtOffset(250, 0);
                    content.showText(String.valueOf(item.quantity));
                    content.newLineAtOffset(45, 0);
                    content.showText(item.unitCode != null ? item.unitCode : "EA");
                    content.newLineAtOffset(45, 0);
                    content.showText(String.format("%s %.2f", currencySymbol, item.price));
                    content.newLineAtOffset(70, 0);
                    double lineTotal = item.quantity * item.price;
                    content.showText(String.format("%s %.2f", currencySymbol, lineTotal));
                    content.endText();

                    // Light line between rows
                    content.setLineWidth(0.4f);
                    content.setStrokingColor(0.7f, 0.85f, 0.95f);  // Light cyan separator
                    content.moveTo(margin, y - 7);
                    content.lineTo(pageWidth - margin, y - 7);
                    content.stroke();
                    content.setStrokingColor(0, 0, 0);

                    y -= 26;
                    itemCount++;
                }
            }

            // Draw thick line below table
            content.setLineWidth(2f);
            content.setStrokingColor(0.0f, 0.65f, 0.85f);  // Nice cyan line
            content.moveTo(margin, y + 5);
            content.lineTo(pageWidth - margin, y + 5);
            content.stroke();
            content.setStrokingColor(0, 0, 0);

            // ========== TOTALS SECTION ==========
            float totalsY = y - 20;

            // Subtotal with more spacing
            content.beginText();
            content.setFont(font, 11);
            content.newLineAtOffset(pageWidth - margin - 220, totalsY);
            content.showText("Subtotal:");
            content.newLineAtOffset(170, 0);
            content.showText(String.format("%s %.2f", currencySymbol, data.subtotal));
            content.endText();

            // Tax with percentage and more spacing
            if (data.tax > 0) {
                content.beginText();
                content.newLineAtOffset(pageWidth - margin - 220, totalsY - 20);
                content.showText(String.format("VAT (%.1f%%):", data.vatRate));
                content.newLineAtOffset(170, 0);
                content.showText(String.format("%s %.2f", currencySymbol, data.tax));
                content.endText();
            }

            // TOTAL - highlighted with cyan color
            float totalBoxY = totalsY - 60;
            content.setNonStrokingColor(0.0f, 0.65f, 0.85f);  // Nice cyan background
            content.addRect(pageWidth - margin - 200, totalBoxY, 270, 32);
            content.fill();
            content.setNonStrokingColor(1.0f, 1.0f, 1.0f);  // White text

            content.beginText();
            content.setFont(font, 18);
            content.newLineAtOffset(pageWidth - margin - 210, totalBoxY + 10);
            content.showText("TOTAL:");
            content.newLineAtOffset(170, 0);
            content.showText(String.format("%s %.2f", currencySymbol, data.total));
            content.endText();

            content.setNonStrokingColor(0, 0, 0);  // Reset to black

            // ========== PAYMENT INFORMATION ==========
            float payY = totalsY - 150;

            content.beginText();
            content.setFont(font, 11);
            content.newLineAtOffset(margin, payY);
            content.showText("PAYMENT INFORMATION");
            content.newLineAtOffset(0, -18);
            content.setFont(font, 10);
            content.showText("Payment Terms: " + data.paymentTerms);
            content.newLineAtOffset(0, -14);
            content.showText("IBAN: " + data.iban);
            content.newLineAtOffset(0, -14);
            content.showText("BIC/SWIFT: " + data.bic);
            content.endText();

            // ========== FOOTER ==========
            // Add a small accent line above footer
            content.setLineWidth(1f);
            content.setStrokingColor(0.0f, 0.65f, 0.85f);  // Nice cyan
            content.moveTo(margin, 65);
            content.lineTo(pageWidth - margin, 65);
            content.stroke();
            content.setStrokingColor(0, 0, 0);

            content.beginText();
            content.setFont(font, 9);
            content.setNonStrokingColor(0.4f, 0.4f, 0.4f);  // Gray text
            content.newLineAtOffset(margin, 48);
            content.showText("Thank you for your business!");
            content.newLineAtOffset(0, -14);
            content.showText("Page 1 of 1");
            content.endText();

            content.setNonStrokingColor(0, 0, 0);  // Reset to black

            content.close();
            addXMPMetadata(document, data);

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            document.save(baos);
            return baos.toByteArray();
        }
    }

    /**
     * Truncate text to fit within maximum width
     */
    private static String truncateText(String text, int maxLength) {
        if (text == null) return "";
        return text.length() > maxLength ? text.substring(0, maxLength - 3) + "..." : text;
    }

    /**
     * Split text into multiple lines
     */
    private static String[] splitText(String text, int maxLength) {
        if (text == null) return new String[0];
        String[] words = text.split(" ");
        java.util.List<String> lines = new java.util.ArrayList<>();
        StringBuilder currentLine = new StringBuilder();

        for (String word : words) {
            if (currentLine.length() + word.length() + 1 <= maxLength) {
                if (currentLine.length() > 0) {
                    currentLine.append(" ");
                }
                currentLine.append(word);
            } else {
                if (currentLine.length() > 0) {
                    lines.add(currentLine.toString());
                }
                currentLine = new StringBuilder(word);
            }
        }

        if (currentLine.length() > 0) {
            lines.add(currentLine.toString());
        }

        return lines.toArray(new String[0]);
    }

    /**
     * Get currency symbol from currency code
     */
    private static String getCurrencySymbol(String currencyCode) {
        if (currencyCode == null || currencyCode.isEmpty()) {
            return "";
        }
        switch (currencyCode.toUpperCase()) {
            case "USD": return "$";
            case "EUR": return "€";
            case "GBP": return "£";
            case "JPY": return "¥";
            case "CHF": return "CHF";
            case "CAD": return "C$";
            case "AUD": return "A$";
            case "CNY": return "¥";
            case "INR": return "₹";
            case "RUB": return "₽";
            case "BRL": return "R$";
            case "KRW": return "₩";
            case "SEK": return "kr";
            case "NOK": return "kr";
            case "DKK": return "kr";
            case "PLN": return "zł";
            case "TRY": return "₺";
            case "MXN": return "$";
            case "SGD": return "S$";
            case "HKD": return "HK$";
            case "NZD": return "NZ$";
            case "ZAR": return "R";
            default: return currencyCode;
        }
    }

    /**
     * Add OutputIntent (ICC profile) for PDF/A-3b compliance
     */
    private static void addOutputIntent(PDDocument document) throws IOException {
        InputStream colorStream = getResourceAsStream("sRGB.icc");
        PDOutputIntent intent = new PDOutputIntent(document, colorStream);
        intent.setOutputCondition("sRGB IEC61966-2.1");
        intent.setOutputConditionIdentifier("sRGB IEC61966-2.1");
        intent.setRegistryName("http://www.color.org");
        document.getDocumentCatalog().addOutputIntent(intent);
        System.out.println("OutputIntent added from resources");
    }

    /**
     * Add XMP metadata for PDF/A-3b
     */
    private static void addXMPMetadata(PDDocument document, InvoiceData data) throws IOException {
        String xmp = createXMPXML(data);

        byte[] bomBytes = new byte[]{(byte) 0xEF, (byte) 0xBB, (byte) 0xBF};
        byte[] xmpBytes = xmp.getBytes("UTF-8");

        byte[] fullMetadata = new byte[bomBytes.length + xmpBytes.length];
        System.arraycopy(bomBytes, 0, fullMetadata, 0, bomBytes.length);
        System.arraycopy(xmpBytes, 0, fullMetadata, bomBytes.length, xmpBytes.length);

        PDMetadata metadata = new PDMetadata(document);
        metadata.importXMPMetadata(fullMetadata);
        document.getDocumentCatalog().setMetadata(metadata);

        System.out.println("XMP metadata added");
    }

    /**
     * Create XMP XML for PDF/A-3b
     */
    private static String createXMPXML(InvoiceData data) {
        StringBuilder xmp = new StringBuilder();
        xmp.append("<?xpacket begin=\"\" id=\"W5M0MpCehiHzreSzNTczkc9d\"?>\n");
        xmp.append("<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:mimetype=\"text/xml\">\n");
        xmp.append(" <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n");
        xmp.append("  <rdf:Description rdf:about=\"\" xmlns:pdfaid=\"http://www.aiim.org/pdfa/ns/id/\">\n");
        xmp.append("   <pdfaid:part>3</pdfaid:part>\n");
        xmp.append("   <pdfaid:conformance>B</pdfaid:conformance>\n");
        xmp.append("  </rdf:Description>\n");
        xmp.append("  <rdf:Description rdf:about=\"\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\">\n");
        xmp.append("   <dc:title><rdf:Alt><rdf:li xml:lang=\"x-default\">Invoice " + data.orderId + "</rdf:li></rdf:Alt></dc:title>\n");
        xmp.append("  </rdf:Description>\n");
        xmp.append("  <rdf:Description rdf:about=\"\" xmlns:pdf=\"http://ns.adobe.com/pdf/1.3/\">\n");
        xmp.append("   <pdf:Producer>Apache PDFBox 3.0.3</pdf:Producer>\n");
        xmp.append("  </rdf:Description>\n");
        xmp.append("  <rdf:Description rdf:about=\"\" xmlns:xmp=\"http://ns.adobe.com/xap/1.0/\">\n");
        xmp.append("   <xmp:CreateDate>" + java.time.Instant.now().toString() + "</xmp:CreateDate>\n");
        xmp.append("  </rdf:Description>\n");
        xmp.append(" </rdf:RDF>\n");
        xmp.append("</x:xmpmeta>\n");
        xmp.append("<?xpacket end=\"w\"?>");
        return xmp.toString();
    }

    /**
     * Helper method to load resources from classpath
     */
    private static InputStream getResourceAsStream(String resourceName) {
        System.out.println("[" + getTimestamp() + "] Loading resource: " + resourceName);
        InputStream is = HTTPServer.class.getClassLoader().getResourceAsStream(resourceName);
        if (is == null) {
            String error = "Resource not found: " + resourceName + ". Make sure it's in src/main/resources/";
            System.err.println("[" + getTimestamp() + "] ERROR: " + error);
            throw new RuntimeException(error);
        }
        System.out.println("[" + getTimestamp() + "] Resource loaded successfully: " + resourceName);
        return is;
    }

    /**
     * Log informational message
     */
    private static void log(String requestId, String message) {
        System.out.println("[" + getTimestamp() + "] [" + requestId + "] " + message);
    }

    /**
     * Log error message with exception
     */
    private static void logError(String requestId, String message, Throwable e) {
        System.err.println("[" + getTimestamp() + "] [" + requestId + "] ERROR: " + message);
        if (e != null) {
            System.err.println("[" + getTimestamp() + "] [" + requestId + "] Exception: " + e.getClass().getName() + ": " + e.getMessage());
            // Print stack trace for debugging
            e.printStackTrace(System.err);
        }
    }

    /**
     * Get current timestamp for logging
     */
    private static String getTimestamp() {
        return java.time.LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS"));
    }

    /**
     * Create error response JSON
     */
    private static String createErrorResponse(String message) {
        JsonObject error = new JsonObject();
        error.addProperty("success", false);
        error.addProperty("error", message != null && !message.isEmpty() ? message : "Unknown error");
        return gson.toJson(error);
    }

    /**
     * Data class for invoice information
     */
    public static class InvoiceData {
        public String orderId;
        public String date;
        public String customerName;
        public String customerEmail;
        public String customerAddress;
        public String companyName;
        public String shopName;
        public String shopAddress;
        public List<LineItem> items;
        public double subtotal;
        public double tax;
        public double total;
        public String currency;
        public double vatRate;
        public String iban;
        public String bic;
        public String paymentTerms;
        public String creator;
        public String locale;
    }

    public static class LineItem {
        public int position;
        public String name;
        public int quantity;
        public String unitCode;
        public double price;
    }
}
