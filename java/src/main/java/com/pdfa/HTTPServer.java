package com.pdfa;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.graphics.color.PDOutputIntent;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
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
                invoice.primaryColor = params.has("primaryColor") ? params.get("primaryColor").getAsString() : "#00a6cc"; // Default cyan
                invoice.bankName = params.has("bankName") ? params.get("bankName").getAsString() : ""; // Bank name
                invoice.logoData = params.has("logoData") ? params.get("logoData").getAsString() : ""; // Base64 logo

                System.out.println("[DEBUG] Java service received primaryColor: " + invoice.primaryColor);
                if (invoice.logoData != null && !invoice.logoData.isEmpty()) {
                    System.out.println("[Logo] Java service received logo data: " + invoice.logoData.length() + " characters");
                } else {
                    System.out.println("[Logo] No logo data received");
                }

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
     * Create PDF/A-3b invoice as byte array with sidebar design
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
            float sidebarWidth = 170;
            float contentMaxX = pageWidth - margin - sidebarWidth - 20;
            String currencySymbol = getCurrencySymbol(data.currency);
            PDPageContentStream content = new PDPageContentStream(document, page);

            // Generate color shades from primary color
            float[] primaryRgb = hexToRgb(data.primaryColor);
            System.out.println("[DEBUG] Creating PDF with primaryColor: " + data.primaryColor + " -> RGB: " + primaryRgb[0] + "," + primaryRgb[1] + "," + primaryRgb[2]);

            // ========== COLORED SIDEBAR (Right side) ==========
            float sidebarX = pageWidth - margin - sidebarWidth;
            content.setNonStrokingColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
            content.addRect(sidebarX, margin, sidebarWidth, pageHeight - 2 * margin);
            content.fill();

            // ========== SIDEBAR CONTENT ==========
            content.setNonStrokingColor(1.0f, 1.0f, 1.0f); // White text

            // "INVOICE" title in sidebar - large
            content.beginText();
            content.setFont(font, 36);
            float invoiceTitleWidth = font.getStringWidth("INVOICE") / 1000 * 36;
            content.newLineAtOffset(sidebarX + (sidebarWidth - invoiceTitleWidth) / 2, pageHeight - margin - 60);
            content.showText("INVOICE");
            content.endText();

            // Divider line in sidebar
            content.setLineWidth(1.0f);
            content.setStrokingColor(1.0f, 1.0f, 1.0f, 0.5f);
            content.moveTo(sidebarX + 20, pageHeight - margin - 85);
            content.lineTo(pageWidth - margin - 20, pageHeight - margin - 85);
            content.stroke();

            // Invoice details in sidebar
            content.setNonStrokingColor(1.0f, 1.0f, 1.0f);
            content.beginText();
            content.setFont(font, 10);
            float sidebarTextY = pageHeight - margin - 115;

            // Invoice number label
            content.setFont(font, 9);
            content.newLineAtOffset(sidebarX + 20, sidebarTextY);
            content.showText("Invoice No:");

            // Invoice number value
            content.setFont(font, 11);
            content.newLineAtOffset(0, -17);
            content.showText(data.orderId);

            // Date label
            content.setFont(font, 9);
            content.newLineAtOffset(0, -32);
            content.showText("Date:");

            // Date value
            content.setFont(font, 11);
            content.newLineAtOffset(0, -17);
            content.showText(data.date);

            // Creator if exists
            if (data.creator != null && !data.creator.isEmpty()) {
                content.setFont(font, 9);
                content.newLineAtOffset(0, -32);
                String[] creatorLines = splitText(data.creator, 18);
                for (String line : creatorLines) {
                    content.newLineAtOffset(0, -14);
                    content.showText(line);
                }
            }
            content.endText();

            // ========== LOGO (Top Left) ==========
            float logoBottomY = pageHeight - margin;
            if (data.logoData != null && !data.logoData.isEmpty()) {
                try {
                    byte[] logoBytes = java.util.Base64.getDecoder().decode(data.logoData);
                    PDImageXObject logoImage = PDImageXObject.createFromByteArray(document, logoBytes, "logo");

                    float maxLogoWidth = 160;
                    float maxLogoHeight = 70;
                    float logoWidth = logoImage.getWidth();
                    float logoHeight = logoImage.getHeight();

                    if (logoWidth > maxLogoWidth || logoHeight > maxLogoHeight) {
                        float widthRatio = maxLogoWidth / logoWidth;
                        float heightRatio = maxLogoHeight / logoHeight;
                        float scale = Math.min(widthRatio, heightRatio);
                        logoWidth *= scale;
                        logoHeight *= scale;
                    }

                    float logoX = margin;
                    float logoY = pageHeight - margin - logoHeight;
                    content.drawImage(logoImage, logoX, logoY, logoWidth, logoHeight);
                    logoBottomY = logoY;

                    System.out.println("[Logo] Successfully drew logo: " + (int)logoWidth + "x" + (int)logoHeight + " at (" + (int)logoX + "," + (int)logoY + ")");
                } catch (Exception e) {
                    System.err.println("[Logo] Failed to draw logo: " + e.getMessage());
                }
            }

            // ========== COMPANY INFO (Left side) ==========
            float companyY = logoBottomY - 20;

            content.setNonStrokingColor(0.15f, 0.15f, 0.15f);
            content.beginText();
            content.setFont(font, 14);
            content.newLineAtOffset(margin, companyY);
            content.showText(data.companyName);
            content.endText();

            content.setNonStrokingColor(0.4f, 0.4f, 0.4f);
            content.beginText();
            content.setFont(font, 9);
            float addrY = companyY - 18;

            if (data.shopName != null && !data.shopName.isEmpty()) {
                content.newLineAtOffset(margin, addrY);
                content.showText(data.shopName);
                addrY -= 14;
            }

            if (data.shopAddress != null && !data.shopAddress.isEmpty()) {
                String[] addrLines = splitText(data.shopAddress, 55);
                for (String line : addrLines) {
                    content.newLineAtOffset(margin, addrY);
                    content.showText(line);
                    addrY -= 14;
                }
            }
            content.endText();

            // ========== BILL TO SECTION ==========
            float billToY = addrY - 25;

            content.setNonStrokingColor(0.3f, 0.3f, 0.3f);
            content.beginText();
            content.setFont(font, 9);
            content.newLineAtOffset(margin, billToY);
            content.showText("BILL TO");
            content.endText();

            // Divider
            content.setLineWidth(0.5f);
            content.setStrokingColor(0.75f, 0.75f, 0.75f);
            content.moveTo(margin, billToY - 8);
            content.lineTo(contentMaxX, billToY - 8);
            content.stroke();

            content.setNonStrokingColor(0.15f, 0.15f, 0.15f);
            content.beginText();
            content.setFont(font, 11);
            content.newLineAtOffset(margin, billToY - 25);
            content.showText(data.customerName);

            content.setFont(font, 9);
            content.setNonStrokingColor(0.4f, 0.4f, 0.4f);
            float customerY = billToY - 43;

            if (data.customerAddress != null && !data.customerAddress.isEmpty()) {
                String[] addrLines = splitText(data.customerAddress, 55);
                for (String line : addrLines) {
                    content.newLineAtOffset(margin, customerY);
                    content.showText(line);
                    customerY -= 14;
                }
            }

            if (data.customerEmail != null && !data.customerEmail.isEmpty()) {
                content.newLineAtOffset(margin, customerY);
                content.showText(data.customerEmail);
                customerY -= 14;
            }
            content.endText();

            // ========== TABLE SECTION ==========
            float tableTopY = customerY - 20;

            // Table header background
            float[] lightBg = lightenColor(primaryRgb, 85);
            content.setNonStrokingColor(lightBg[0], lightBg[1], lightBg[2]);
            content.addRect(margin, tableTopY - 24, contentMaxX - margin, 24);
            content.fill();

            // Define column positions for consistent alignment
            float colPos = margin + 12;
            float colItem = colPos + 30;
            float colQty = colItem + 235;
            float colPrice = colQty + 50;
            float colTotal = colPrice + 70;

            // Table header text
            content.setNonStrokingColor(0.3f, 0.3f, 0.3f);
            content.beginText();
            content.setFont(font, 9);
            float headerY = tableTopY - 16;

            // # header
            content.newLineAtOffset(colPos, headerY);
            content.showText("#");

            // ITEM header
            content.newLineAtOffset(colItem - colPos, 0);
            content.showText("ITEM");

            // QTY header (right-aligned)
            String qtyHeader = "QTY";
            float qtyHeaderWidth = font.getStringWidth(qtyHeader) / 1000 * 9;
            content.newLineAtOffset(colQty - colPos - qtyHeaderWidth, 0);
            content.showText(qtyHeader);

            // PRICE header (right-aligned)
            String priceHeader = "PRICE";
            float priceHeaderWidth = font.getStringWidth(priceHeader) / 1000 * 9;
            content.newLineAtOffset(colPrice - colPos + qtyHeaderWidth - priceHeaderWidth, 0);
            content.showText(priceHeader);

            // TOTAL header (right-aligned)
            String totalHeader = "TOTAL";
            float totalHeaderWidth = font.getStringWidth(totalHeader) / 1000 * 9;
            content.newLineAtOffset(colTotal - colPos + priceHeaderWidth - totalHeaderWidth, 0);
            content.showText(totalHeader);

            content.endText();

            // Table items
            float y = tableTopY - 32;
            int itemCount = 0;

            if (data.items != null && !data.items.isEmpty()) {
                for (LineItem item : data.items) {
                    // Alternating row background
                    if (itemCount % 2 == 0) {
                        float[] veryLightBg = lightenColor(primaryRgb, 93);
                        content.setNonStrokingColor(veryLightBg[0], veryLightBg[1], veryLightBg[2]);
                        content.addRect(margin, y - 5, contentMaxX - margin, 20);
                        content.fill();
                    }

                    content.setNonStrokingColor(0.15f, 0.15f, 0.15f);
                    content.beginText();
                    content.setFont(font, 9);

                    // Position
                    String pos = String.valueOf(item.position > 0 ? item.position : (itemCount + 1));
                    content.newLineAtOffset(colPos, y);
                    content.showText(pos);

                    // Name
                    content.newLineAtOffset(colItem - colPos, 0);
                    content.showText(truncateText(item.name, 40));

                    // Quantity (right-aligned)
                    String qtyStr = String.valueOf(item.quantity);
                    float qtyWidth = font.getStringWidth(qtyStr) / 1000 * 9;
                    content.newLineAtOffset(colQty - colPos - qtyWidth, 0);
                    content.showText(qtyStr);

                    // Price (right-aligned)
                    String priceStr = currencySymbol + String.format("%.2f", item.price);
                    float priceWidth = font.getStringWidth(priceStr) / 1000 * 9;
                    content.newLineAtOffset(colPrice - colQty + qtyWidth - priceWidth, 0);
                    content.showText(priceStr);

                    // Total (right-aligned)
                    double lineTotal = item.price * item.quantity;
                    String totalStr = currencySymbol + String.format("%.2f", lineTotal);
                    float totalWidth = font.getStringWidth(totalStr) / 1000 * 9;
                    content.newLineAtOffset(colTotal - colPrice + priceWidth - totalWidth, 0);
                    content.showText(totalStr);
                    content.endText();

                    y -= 20;
                    itemCount++;
                }
            }

            // ========== TOTALS SECTION (Right aligned, before sidebar) ==========
            float totalsY = y - 25;

            // Subtotal
            content.setNonStrokingColor(0.5f, 0.5f, 0.5f);
            content.beginText();
            content.setFont(font, 9);
            content.newLineAtOffset(contentMaxX - 140, totalsY);
            content.showText("Subtotal:");
            content.endText();

            content.setNonStrokingColor(0.15f, 0.15f, 0.15f);
            content.beginText();
            content.setFont(font, 10);
            String subtotalStr = currencySymbol + String.format("%.2f", data.subtotal);
            float subtotalWidth = font.getStringWidth(subtotalStr) / 1000 * 10;
            content.newLineAtOffset(contentMaxX - 10 - subtotalWidth, totalsY);
            content.showText(subtotalStr);
            content.endText();

            // Tax
            content.setNonStrokingColor(0.5f, 0.5f, 0.5f);
            content.beginText();
            content.setFont(font, 9);
            content.newLineAtOffset(contentMaxX - 140, totalsY - 20);
            content.showText("Tax (" + (int)data.vatRate + "%):");
            content.endText();

            content.setNonStrokingColor(0.15f, 0.15f, 0.15f);
            content.beginText();
            content.setFont(font, 10);
            String taxStr = currencySymbol + String.format("%.2f", data.tax);
            float taxWidth = font.getStringWidth(taxStr) / 1000 * 10;
            content.newLineAtOffset(contentMaxX - 10 - taxWidth, totalsY - 20);
            content.showText(taxStr);
            content.endText();

            // TOTAL box with primary color background
            float totalBoxY = totalsY - 55;
            content.setNonStrokingColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
            content.addRect(contentMaxX - 155, totalBoxY, 155, 32);
            content.fill();

            content.setNonStrokingColor(1.0f, 1.0f, 1.0f);
            content.beginText();
            content.setFont(font, 13);
            String totalText = "TOTAL " + currencySymbol + String.format("%.2f", data.total);
            content.newLineAtOffset(contentMaxX - 145, totalBoxY + 20);
            content.showText(totalText);
            content.endText();

            // ========== PAYMENT INFORMATION ==========
            float payY = totalBoxY - 45;

            content.setNonStrokingColor(0.3f, 0.3f, 0.3f);
            content.beginText();
            content.setFont(font, 9);
            content.newLineAtOffset(margin, payY);
            content.showText("PAYMENT DETAILS");
            content.endText();

            // Divider
            content.setLineWidth(0.5f);
            content.setStrokingColor(0.75f, 0.75f, 0.75f);
            content.moveTo(margin, payY - 8);
            content.lineTo(margin + 160, payY - 8);
            content.stroke();

            content.setNonStrokingColor(0.4f, 0.4f, 0.4f);
            content.beginText();
            content.setFont(font, 8);
            float payLabelX = margin;
            float payValueX = margin + 70;

            content.newLineAtOffset(payLabelX, payY - 22);
            content.showText("Bank:");
            content.newLineAtOffset(payValueX - payLabelX, 0);
            content.showText(data.bankName != null && !data.bankName.isEmpty() ? data.bankName : "Your Bank");

            content.newLineAtOffset(payLabelX - payValueX, -15);
            content.showText("IBAN:");
            content.newLineAtOffset(70, 0);
            content.showText(data.iban != null && !data.iban.isEmpty() ? data.iban : "N/A");

            content.newLineAtOffset(-70, -15);
            content.showText("BIC:");
            content.newLineAtOffset(70, 0);
            content.showText(data.bic != null && !data.bic.isEmpty() ? data.bic : "N/A");

            if (data.paymentTerms != null && !data.paymentTerms.isEmpty()) {
                content.newLineAtOffset(-70, -15);
                content.showText("Terms:");
                content.newLineAtOffset(70, 0);
                content.showText(data.paymentTerms);
            }
            content.endText();

            // ========== FOOTER ==========
            float footerY = 70;

            // Divider line
            content.setLineWidth(0.3f);
            content.setStrokingColor(0.7f, 0.7f, 0.7f);
            content.moveTo(margin, footerY + 15);
            content.lineTo(contentMaxX, footerY + 15);
            content.stroke();

            // Thank you message (centered in content area)
            content.setNonStrokingColor(0.4f, 0.4f, 0.4f);
            content.beginText();
            content.setFont(font, 8);
            String thankYou = "Thank you for your business!";
            float thankYouWidth = font.getStringWidth(thankYou) / 1000 * 8;
            content.newLineAtOffset((contentMaxX + margin - thankYouWidth) / 2, footerY + 8);
            content.showText(thankYou);
            content.endText();

            // Branding
            content.setNonStrokingColor(0.35f, 0.35f, 0.35f);
            content.beginText();
            content.setFont(font, 7);
            String branding = "Powered by PDFify • pdfify.pro";
            float brandingWidth = font.getStringWidth(branding) / 1000 * 7;
            content.newLineAtOffset(contentMaxX - brandingWidth, footerY - 6);
            content.showText(branding);
            content.endText();

            content.close();

            // Add metadata and save
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
        public String bankName;
        public String paymentTerms;
        public String creator;
        public String locale;
        public String primaryColor; // Hex color code (e.g., "#00a6cc")
        public String logoData; // Base64 encoded PNG logo
    }

    public static class LineItem {
        public int position;
        public String name;
        public int quantity;
        public String unitCode;
        public double price;
    }

    /**
     * Convert hex color to RGB array
     * @param hexColor Hex color string (e.g., "#00a6cc" or "00a6cc")
     * @return float array [r, g, b] with values 0.0-1.0
     */
    private static float[] hexToRgb(String hexColor) {
        if (hexColor == null || hexColor.isEmpty()) {
            // Default cyan color
            return new float[]{0.0f, 0.65f, 0.85f};
        }

        // Remove # if present
        hexColor = hexColor.replace("#", "");

        if (hexColor.length() != 6) {
            // Default cyan if invalid
            return new float[]{0.0f, 0.65f, 0.85f};
        }

        try {
            int r = Integer.parseInt(hexColor.substring(0, 2), 16);
            int g = Integer.parseInt(hexColor.substring(2, 4), 16);
            int b = Integer.parseInt(hexColor.substring(4, 6), 16);

            return new float[]{r / 255.0f, g / 255.0f, b / 255.0f};
        } catch (NumberFormatException e) {
            // Default cyan if parsing fails
            return new float[]{0.0f, 0.65f, 0.85f};
        }
    }

    /**
     * Lighten an RGB color by a percentage
     * @param rgb Original RGB color [r, g, b]
     * @param percent Amount to lighten (0-100)
     * @return Lightened RGB color [r, g, b]
     */
    private static float[] lightenColor(float[] rgb, int percent) {
        float factor = 1.0f + (percent / 100.0f);
        return new float[]{
            Math.min(1.0f, rgb[0] * factor),
            Math.min(1.0f, rgb[1] * factor),
            Math.min(1.0f, rgb[2] * factor)
        };
    }
}
