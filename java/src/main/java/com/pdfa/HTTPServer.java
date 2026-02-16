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
                        line.name = itemObj.has("name") ? itemObj.get("name").getAsString() : "Item";
                        line.quantity = itemObj.has("quantity") ? itemObj.get("quantity").getAsInt() : 1;
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
     * Create PDF/A-3b invoice as byte array
     */
    private static byte[] createPdfA3B(InvoiceData data) throws IOException {
        try (PDDocument document = new PDDocument()) {
            // Add OutputIntent for PDF/A-3b
            addOutputIntent(document);

            // Add page
            PDPage page = new PDPage();
            document.addPage(page);

            // Load and embed TrueType font from resources
            InputStream fontStream = getResourceAsStream("LiberationSans-Regular.ttf");
            PDType0Font font = PDType0Font.load(document, fontStream);

            // Create content stream
            PDPageContentStream content = new PDPageContentStream(document, page);

            // Position tracking
            float yPosition = 750;
            float leftMargin = 50;
            float rightMargin = 400;
            float lineHeight = 18;

            content.beginText();

            // ========== HEADER SECTION ==========
            // Invoice title (top left)
            content.setFont(font, 24);
            content.newLineAtOffset(leftMargin, yPosition);
            content.showText("INVOICE");
            yPosition -= 35;

            // Order info (top right)
            content.setFont(font, 10);
            float orderInfoX = 400;
            float orderInfoY = 750;
            content.newLineAtOffset(orderInfoX - leftMargin, orderInfoY - yPosition - 35);
            content.showText("Invoice Number: " + data.orderId);
            content.newLineAtOffset(0, -lineHeight);
            content.showText("Date: " + data.date);
            if (data.creator != null && !data.creator.isEmpty()) {
                content.newLineAtOffset(0, -lineHeight);
                content.showText("Created by: " + data.creator);
            }

            // Reset to left side
            yPosition = 680;

            // ========== FROM / COMPANY SECTION ==========
            content.setFont(font, 11);
            content.newLineAtOffset(leftMargin - orderInfoX, yPosition - 750);
            content.showText("FROM:");
            yPosition -= lineHeight;

            content.setFont(font, 11);
            String companyName = data.companyName != null ? data.companyName : "";
            content.newLineAtOffset(leftMargin - 400, -lineHeight);
            content.showText(truncateText(companyName, 50));

            if (data.shopAddress != null && !data.shopAddress.isEmpty()) {
                yPosition -= lineHeight;
                content.newLineAtOffset(0, 0);
                content.showText(truncateText(data.shopAddress, 50));
            }

            // ========== TO / CUSTOMER SECTION ==========
            yPosition -= 30;
            content.setFont(font, 11);
            content.newLineAtOffset(0, yPosition - 640);
            content.showText("BILL TO:");
            yPosition -= lineHeight;

            content.setFont(font, 11);
            String customerName = data.customerName != null ? data.customerName : "";
            content.newLineAtOffset(leftMargin - 400, -lineHeight);
            content.showText(truncateText(customerName, 50));

            if (data.customerAddress != null && !data.customerAddress.isEmpty()) {
                yPosition -= lineHeight;
                content.newLineAtOffset(0, 0);
                // Split address into multiple lines if needed
                String[] addressLines = splitText(data.customerAddress, 50);
                for (String line : addressLines) {
                    content.showText(line);
                    yPosition -= lineHeight;
                    if (addressLines.length > 1 && !line.equals(addressLines[addressLines.length - 1])) {
                        content.newLineAtOffset(0, -lineHeight);
                    }
                }
            }

            if (data.customerEmail != null && !data.customerEmail.isEmpty()) {
                yPosition -= lineHeight;
                content.newLineAtOffset(0, 0);
                content.showText("Email: " + data.customerEmail);
            }

            // ========== LINE ITEMS SECTION ==========
            yPosition -= 30;

            // Header line
            content.setFont(font, 10);
            content.newLineAtOffset(leftMargin - 400, yPosition - 600);
            content.showText("====================================================================================================");
            yPosition -= lineHeight;

            // Column headers
            content.setFont(font, 10);
            content.newLineAtOffset(0, yPosition - 585);
            content.showText(String.format("%-45s %6s %12s %12s %12s", "Description", "Qty", "Unit Price", "Tax", "Total"));
            yPosition -= lineHeight;

            // Header line
            content.newLineAtOffset(0, yPosition - 570);
            content.showText("====================================================================================================");
            yPosition -= lineHeight;

            // Items
            content.setFont(font, 9);
            if (data.items != null && !data.items.isEmpty()) {
                for (LineItem item : data.items) {
                    content.newLineAtOffset(leftMargin - 400, yPosition - 555);

                    String name = item.name != null ? item.name : "";
                    double lineTotal = item.quantity * item.price;
                    double lineTax = lineTotal * (data.vatRate / 100.0);

                    content.showText(String.format("%-45s %6d %12.2f %12.2f %12.2f",
                        truncateText(name, 45),
                        item.quantity,
                        item.price,
                        lineTax,
                        lineTotal));
                    yPosition -= lineHeight * 1.3;
                }
            }

            // Bottom line
            yPosition += 10;
            content.setFont(font, 10);
            content.newLineAtOffset(leftMargin - 400, yPosition - 520);
            content.showText("====================================================================================================");

            // ========== TOTALS SECTION ==========
            yPosition -= 30;

            // Subtotal
            if (data.subtotal > 0) {
                content.setFont(font, 10);
                content.newLineAtOffset(rightMargin, yPosition - 500);
                content.showText(String.format("Subtotal: %40.2f %s", data.subtotal, data.currency));
                yPosition -= lineHeight;
            }

            // Tax
            if (data.tax > 0) {
                content.newLineAtOffset(0, yPosition - 485);
                content.showText(String.format("VAT (%.0f%%): %41.2f %s", data.vatRate, data.tax, data.currency));
                yPosition -= lineHeight;
            }

            // Total
            content.setFont(font, 14);
            content.newLineAtOffset(0, yPosition - 468);
            content.showText(String.format("TOTAL: %44.2f %s", data.total, data.currency));

            // ========== PAYMENT INFORMATION SECTION ==========
            yPosition -= 50;

            content.setFont(font, 10);
            content.newLineAtOffset(leftMargin - rightMargin, yPosition - 420);
            content.showText("PAYMENT INFORMATION:");

            yPosition -= lineHeight * 1.5;
            content.setFont(font, 9);

            if (data.paymentTerms != null && !data.paymentTerms.isEmpty()) {
                content.newLineAtOffset(leftMargin - 400, yPosition - 405);
                content.showText("Payment Terms: " + data.paymentTerms);
                yPosition -= lineHeight;
            }

            if (data.iban != null && !data.iban.isEmpty()) {
                content.newLineAtOffset(0, yPosition - 390);
                content.showText("IBAN: " + data.iban);
                yPosition -= lineHeight;
            }

            if (data.bic != null && !data.bic.isEmpty()) {
                content.newLineAtOffset(0, yPosition - 375);
                content.showText("BIC/SWIFT: " + data.bic);
            }

            content.endText();
            content.close();

            // Add XMP metadata
            addXMPMetadata(document, data);

            // Write to byte array
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            document.save(baos);

            System.out.println("PDF/A-3b created successfully, size: " + baos.size() + " bytes");
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
        public String name;
        public int quantity;
        public double price;
    }
}
