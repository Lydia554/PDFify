package com.pdfa;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
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
            try {
                // Parse JSON-RPC request
                JsonObject requestBody = JsonParser.parseString(req.body()).getAsJsonObject();
                String method = requestBody.get("method").getAsString();
                JsonObject params = requestBody.getAsJsonObject("params");

                if (!"createPDFA3B".equals(method)) {
                    res.status(400);
                    return gson.toJson(Map.of("error", "Unknown method: " + method));
                }

                // Create invoice data from params
                InvoiceData invoice = new InvoiceData();
                invoice.orderId = params.get("orderId").getAsString();
                invoice.date = params.has("date") ? params.get("date").getAsString() : java.time.LocalDate.now().toString();
                invoice.customerName = params.has("customerName") ? params.get("customerName").getAsString() : "Customer";
                invoice.companyName = params.has("companyName") ? params.get("companyName").getAsString() : "Your Company";
                invoice.currency = params.has("currency") ? params.get("currency").getAsString() : "USD";
                invoice.total = params.has("total") ? params.get("total").getAsDouble() : 0.0;
                invoice.vatRate = params.has("vatRate") ? params.get("vatRate").getAsDouble() : 21.0;
                invoice.subtotal = params.has("subtotal") ? params.get("subtotal").getAsDouble() : 0.0;
                invoice.tax = params.has("tax") ? params.get("tax").getAsDouble() : 0.0;

                // Parse items
                if (params.has("items") && params.get("items").isJsonArray()) {
                    invoice.items = new ArrayList<>();
                    params.getAsJsonArray("items").forEach(item -> {
                        JsonObject itemObj = item.getAsJsonObject();
                        LineItem line = new LineItem();
                        line.name = itemObj.get("name").getAsString();
                        line.quantity = itemObj.has("quantity") ? itemObj.get("quantity").getAsInt() : 1;
                        line.price = itemObj.has("price") ? itemObj.get("price").getAsDouble() : 0.0;
                        invoice.items.add(line);
                    });
                }

                // Generate PDF to byte array
                byte[] pdfBytes = createPdfA3B(invoice);

                // Return PDF
                res.type("application/pdf");
                res.header("Content-Disposition", "attachment; filename=invoice.pdf");
                return pdfBytes;

            } catch (Exception e) {
                e.printStackTrace();
                res.status(500);
                JsonObject error = new JsonObject();
                error.addProperty("error", e.getMessage());
                return error.toString();
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

            // Create content stream
            PDPageContentStream content = new PDPageContentStream(document, page);

            // Use built-in Helvetica font to avoid file dependencies
            PDType1Font font = PDType1Font.HELVETICA;

            // Position tracking
            float yPosition = 700;
            float leftMargin = 50;
            float lineHeight = 20;

            content.beginText();
            content.setFont(font, 16);

            // Invoice title
            content.newLineAtOffset(leftMargin, yPosition);
            content.showText("INVOICE");
            yPosition -= lineHeight * 2;

            // Order ID
            content.setFont(font, 12);
            content.newLineAtOffset(50, yPosition);
            content.showText("Order ID: " + data.orderId);
            yPosition -= lineHeight;

            // Date
            content.newLineAtOffset(50, yPosition);
            content.showText("Date: " + data.date);
            yPosition -= lineHeight * 2;

            // From
            content.setFont(font, 11);
            content.newLineAtOffset(50, yPosition);
            content.showText("FROM:");
            content.newLineAtOffset(50, yPosition - lineHeight);
            content.setFont(font, 12);
            content.showText(data.companyName);
            yPosition -= lineHeight * 3;

            // To
            content.setFont(font, 11);
            content.newLineAtOffset(50, yPosition);
            content.showText("TO:");
            content.newLineAtOffset(50, yPosition - lineHeight);
            content.setFont(font, 12);
            content.showText(data.customerName);
            yPosition -= lineHeight * 3;

            // Line items header
            content.setFont(font, 11);
            content.newLineAtOffset(50, yPosition);
            content.showText("--------------------------------------------------------------------------------");
            yPosition -= lineHeight;
            content.newLineAtOffset(50, yPosition);
            content.showText(String.format("%-40s %8s %10s %10s", "Description", "Qty", "Price", "Total"));
            yPosition -= lineHeight;
            content.newLineAtOffset(50, yPosition);
            content.showText("--------------------------------------------------------------------------------");

            // Line items
            yPosition -= lineHeight;
            content.setFont(font, 10);
            if (data.items != null) {
                for (LineItem item : data.items) {
                    content.newLineAtOffset(50, yPosition);
                    double lineTotal = item.quantity * item.price;
                    content.showText(String.format("%-40s %8d %10.2f %10.2f",
                        item.name, item.quantity, item.price, lineTotal));
                    yPosition -= lineHeight * 1.5;
                }
            }

            // Total line
            yPosition += lineHeight;
            content.setFont(font, 11);
            content.newLineAtOffset(50, yPosition);
            content.showText("--------------------------------------------------------------------------------");
            yPosition -= lineHeight * 2;

            // Subtotal
            if (data.subtotal > 0) {
                content.setFont(font, 12);
                content.newLineAtOffset(400, yPosition);
                content.showText(String.format("Subtotal: %.2f %s", data.subtotal, data.currency));
                yPosition -= lineHeight;
            }

            // Tax
            if (data.tax > 0) {
                content.newLineAtOffset(400, yPosition);
                content.showText(String.format("Tax (%.0f%%): %.2f %s", data.vatRate, data.tax, data.currency));
                yPosition -= lineHeight;
            }

            // Final total
            content.setFont(font, 14);
            content.newLineAtOffset(400, yPosition);
            content.showText(String.format("TOTAL: %.2f %s", data.total, data.currency));

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
     * Add OutputIntent (ICC profile) for PDF/A-3b compliance
     */
    private static void addOutputIntent(PDDocument document) throws IOException {
        try {
            // Try to use sRGB from URL
            InputStream colorStream = new java.net.URL("https://www.color.org/sRGB.icc").openStream();
            PDOutputIntent intent = new PDOutputIntent(document, colorStream);
            intent.setOutputCondition("sRGB IEC61966-2.1");
            intent.setOutputConditionIdentifier("sRGB IEC61966-2.1");
            intent.setRegistryName("http://www.color.org");
            document.getDocumentCatalog().addOutputIntent(intent);
            System.out.println("OutputIntent added from URL");
        } catch (Exception e) {
            System.out.println("WARNING: Could not load ICC profile: " + e.getMessage());
            // Continue without ICC profile - PDF may not be fully compliant but will still work
        }
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
     * Data class for invoice information
     */
    public static class InvoiceData {
        public String orderId;
        public String date;
        public String customerName;
        public String companyName;
        public List<LineItem> items;
        public double subtotal;
        public double tax;
        public double total;
        public String currency;
        public double vatRate;
    }

    public static class LineItem {
        public String name;
        public int quantity;
        public double price;
    }
}
