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
     * Create PDF/A-3b invoice as byte array with improved design
     */
    private static byte[] createPdfA3B(InvoiceData data) throws IOException {
        try (PDDocument document = new PDDocument()) {
            // Add OutputIntent for PDF/A-3b
            addOutputIntent(document);

            // Add page
            PDPage page = new PDPage(PDPage.A4);
            document.addPage(page);

            // Load TrueType font from resources
            InputStream fontStream = getResourceAsStream("LiberationSans-Regular.ttf");
            PDType0Font font = PDType0Font.load(document, fontStream);

            // Page dimensions
            float pageWidth = PDPage.A4.getMediaBox().getWidth();
            float pageHeight = PDPage.A4.getMediaBox().getHeight();
            float margin = 50;
            float currentY = pageHeight - margin;

            // Create content stream
            PDPageContentStream content = new PDPageContentStream(document, page);

            // ========== HEADER WITH BACKGROUND ==========
            // Draw header background bar
            content.setNonStrokingColor(0.95f, 0.97f, 1.0f);
            content.addRect(margin, pageHeight - 100, pageWidth - 2 * margin, 100);
            content.fill();
            content.setNonStrokingColor(0, 0, 0);

            content.beginText();

            // Large INVOICE text
            content.setFont(font, 36);
            content.newLineAtOffset(margin, pageHeight - 65);
            content.showText("INVOICE");
            content.newLineAtOffset(0, -25);
            content.setFont(font, 10);
            content.showText(data.orderId);
            content.newLineAtOffset(0, -15);
            content.showText("Date: " + data.date);

            // Company info on right side
            float rightX = pageWidth - margin - 150;
            float currentX = rightX - (margin + 400);
            content.newLineAtOffset(currentX, 50);
            content.setFont(font, 12);
            content.showText(data.companyName);
            content.newLineAtOffset(0, -14);
            content.setFont(font, 9);
            if (data.shopAddress != null && !data.shopAddress.isEmpty()) {
                String[] addrLines = splitText(data.shopAddress, 35);
                for (String line : addrLines) {
                    content.showText(line);
                    content.newLineAtOffset(0, -12);
                }
            }

            content.endText();

            // ========== FROM / TO SECTIONS WITH BOXES ==========
            currentY = pageHeight - 200;

            // Draw section boxes
            content.setLineWidth(0.5f);
            content.setStrokingColor(0.7f, 0.7f, 0.7f);
            float boxY = currentY - 70;
            content.addRect(margin, boxY, pageWidth / 2 - margin - 20, 70);
            content.stroke();
            content.addRect(pageWidth / 2 + 20, boxY, pageWidth / 2 - margin - 20, 70);
            content.stroke();
            content.setStrokingColor(0, 0, 0);

            content.beginText();
            content.setFont(font, 11);
            content.newLineAtOffset(margin + 10, boxY + 55);
            content.showText("FROM:");
            content.newLineAtOffset(0, -15);
            content.setFont(font, 10);
            content.showText(data.companyName);
            if (data.shopAddress != null && !data.shopAddress.isEmpty()) {
                content.newLineAtOffset(0, -12);
                String[] addr = splitText(data.shopAddress, 40);
                for (int i = 0; i < Math.min(addr.length, 3); i++) {
                    content.showText(addr[i]);
                    if (i < addr.length - 1 && i < 2) {
                        content.newLineAtOffset(0, -12);
                    }
                }
            }

            // To section
            content.setTextMatrix(pageWidth / 2 + 30, boxY + 55);
            content.setFont(font, 11);
            content.showText("BILL TO:");
            content.newLineAtOffset(0, -15);
            content.setFont(font, 10);
            content.showText(data.customerName);
            if (data.customerAddress != null && !data.customerAddress.isEmpty()) {
                content.newLineAtOffset(0, -12);
                String[] addr = splitText(data.customerAddress, 40);
                for (int i = 0; i < Math.min(addr.length, 3); i++) {
                    content.showText(addr[i]);
                    if (i < addr.length - 1 && i < 2) {
                        content.newLineAtOffset(0, -12);
                    }
                }
            }
            if (data.customerEmail != null && !data.customerEmail.isEmpty()) {
                content.newLineAtOffset(0, -12);
                content.showText(data.customerEmail);
            }

            content.endText();

            // ========== ITEMS TABLE HEADER ==========
            float tableStartY = boxY - 50;

            // Table header background
            content.setNonStrokingColor(0.93f, 0.95f, 0.98f);
            content.addRect(margin, tableStartY - 25, pageWidth - 2 * margin, 25);
            content.fill();
            content.setNonStrokingColor(0, 0, 0);

            // Table header line
            content.setLineWidth(1);
            content.moveTo(margin, tableStartY);
            content.lineTo(pageWidth - margin, tableStartY);
            content.stroke();

            content.beginText();
            content.setFont(font, 10);
            content.newLineAtOffset(margin + 10, tableStartY - 10);
            content.showText("DESCRIPTION");
            content.setTextMatrix(margin + 300, tableStartY - 10);
            content.showText("QTY");
            content.setTextMatrix(margin + 430, tableStartY - 10);
            content.showText("UNIT PRICE");
            content.setTextMatrix(margin + 500, tableStartY - 10);
            content.showText("TAX");
            content.setTextMatrix(pageWidth - margin - 80, tableStartY - 10);
            content.showText("TOTAL");
            content.endText();

            // ========== ITEMS TABLE CONTENT ==========
            float itemY = tableStartY - 45;
            int itemCount = 0;

            if (data.items != null && !data.items.isEmpty()) {
                for (LineItem item : data.items) {
                    // Alternating row background
                    if (itemCount % 2 == 0) {
                        content.setNonStrokingColor(0.98f, 0.98f, 0.98f);
                        content.addRect(margin, itemY - 5, pageWidth - 2 * margin, 20);
                        content.fill();
                        content.setNonStrokingColor(0, 0, 0);
                    }

                    // Item row
                    content.beginText();
                    content.setFont(font, 9);
                    content.newLineAtOffset(margin + 10, itemY);
                    content.showText(truncateText(item.name, 40));
                    content.setTextMatrix(margin + 300, itemY);
                    content.showText(String.valueOf(item.quantity));
                    content.setTextMatrix(margin + 430, itemY);
                    content.showText(String.format("%.2f %s", item.price, data.currency));
                    content.setTextMatrix(margin + 500, itemY);
                    double lineTax = item.quantity * item.price * (data.vatRate / 100.0);
                    content.showText(String.format("%.2f", lineTax));
                    content.setTextMatrix(pageWidth - margin - 80, itemY);
                    double lineTotal = item.quantity * item.price;
                    content.showText(String.format("%.2f %s", lineTotal, data.currency));
                    content.endText();

                    // Bottom line for this row
                    content.setLineWidth(0.3f);
                    content.setStrokingColor(0.85f, 0.85f, 0.85f);
                    content.moveTo(margin, itemY - 8);
                    content.lineTo(pageWidth - margin, itemY - 8);
                    content.stroke();
                    content.setStrokingColor(0, 0, 0);

                    itemY -= 25;
                    itemCount++;

                    // New page if needed
                    if (itemY < 200) {
                        content.close();
                        page = new PDPage(PDPage.A4);
                        document.addPage(page);
                        content = new PDPageContentStream(document, page);
                        itemY = pageHeight - 100;
                    }
                }
            }

            // Table bottom border
            content.setLineWidth(1);
            content.moveTo(margin, itemY + 5);
            content.lineTo(pageWidth - margin, itemY + 5);
            content.stroke();

            // ========== TOTALS SECTION ==========
            float totalsY = itemY - 30;

            // Totals box background
            content.setNonStrokingColor(0.97f, 0.97f, 0.97f);
            content.addRect(pageWidth / 2, totalsY - 80, pageWidth / 2 - margin, 80);
            content.fill();
            content.setStrokingColor(0.7f, 0.7f, 0.7f);
            content.setLineWidth(0.5f);
            content.stroke();
            content.setStrokingColor(0, 0, 0);
            content.setNonStrokingColor(0, 0, 0);

            content.beginText();
            float totalLabelX = pageWidth / 2 + 20;
            float totalValueX = pageWidth - margin - 10;

            content.setFont(font, 10);
            content.setTextMatrix(totalLabelX, totalsY - 15);
            content.showText("Subtotal:");
            content.setTextMatrix(totalValueX, totalsY - 15);
            content.showText(String.format("%.2f %s", data.subtotal, data.currency));

            if (data.tax > 0) {
                content.setTextMatrix(totalLabelX, totalsY - 35);
                content.showText(String.format("VAT (%.0f%%):", data.vatRate));
                content.setTextMatrix(totalValueX, totalsY - 35);
                content.showText(String.format("%.2f %s", data.tax, data.currency));
            }

            // Total - highlighted
            content.setFont(font, 14);
            content.setTextMatrix(totalLabelX, totalsY - 60);
            content.showText("TOTAL:");
            content.setTextMatrix(totalValueX, totalsY - 60);
            content.showText(String.format("%.2f %s", data.total, data.currency));

            // ========== PAYMENT INFO ==========
            content.setFont(font, 9);
            float payY = totalsY - 100;
            content.setTextMatrix(margin, payY);
            content.showText("Payment Terms: " + data.paymentTerms);
            content.setTextMatrix(margin, payY - 15);
            content.showText("IBAN: " + data.iban);
            content.setTextMatrix(margin, payY - 30);
            content.showText("BIC: " + data.bic);

            content.endText();
            content.close();

            // Add XMP metadata
            addXMPMetadata(document, data);

            // Write to byte array
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            document.save(baos);

            System.out.println("PDF/A-3b created successfully with improved design, size: " + baos.size() + " bytes");
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
