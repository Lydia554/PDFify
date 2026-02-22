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
                invoice.zugferdXml = params.has("zugferdXml") ? params.get("zugferdXml").getAsString() : ""; // ZUGFeRD XML

                System.out.println("[DEBUG] Java service received primaryColor: " + invoice.primaryColor);
                if (invoice.logoData != null && !invoice.logoData.isEmpty()) {
                    System.out.println("[Logo] Java service received logo data: " + invoice.logoData.length() + " characters");
                } else {
                    System.out.println("[Logo] No logo data received");
                }
                if (invoice.zugferdXml != null && !invoice.zugferdXml.isEmpty()) {
                    System.out.println("[ZUGFeRD] Java service received ZUGFeRD XML: " + invoice.zugferdXml.length() + " characters");
                } else {
                    System.out.println("[ZUGFeRD] No ZUGFeRD XML received");
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

                // Generate PDF to PDDocument
                PDDocument document = createPdfA3BDocument(invoice);

                // Embed ZUGFeRD XML if provided
                if (invoice.zugferdXml != null && !invoice.zugferdXml.isEmpty()) {
                    System.out.println("[ZUGFeRD] Embedding ZUGFeRD XML into PDF...");
                    embedZugferdXml(document, invoice.zugferdXml);
                    System.out.println("[ZUGFeRD] ZUGFeRD XML embedded successfully");
                }

                // Convert to byte array
                java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
                document.save(baos);
                document.close();
                byte[] pdfBytes = baos.toByteArray();

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
     * Create PDF/A-3b invoice as PDDocument (for further processing like ZUGFeRD embedding)
     */
    private static PDDocument createPdfA3BDocument(InvoiceData data) throws IOException {
        // Get translations based on locale
        Translations t = getTranslations(data.locale);

        PDDocument document = new PDDocument();
        addOutputIntent(document);
        PDPage page = new PDPage(org.apache.pdfbox.pdmodel.common.PDRectangle.A4);
        document.addPage(page);

            InputStream fontStream = getResourceAsStream("LiberationSans-Regular.ttf");
            PDType0Font font = PDType0Font.load(document, fontStream);

            float pageWidth = org.apache.pdfbox.pdmodel.common.PDRectangle.A4.getWidth();
            float pageHeight = org.apache.pdfbox.pdmodel.common.PDRectangle.A4.getHeight();
            float margin = 50;
            float contentWidth = pageWidth - 2 * margin;
            String currencySymbol = getCurrencySymbol(data.currency);
            PDPageContentStream content = new PDPageContentStream(document, page);

            // Generate color shades from primary color
            float[] primaryRgb = hexToRgb(data.primaryColor);
            float[] lighterBg = lightenColor(primaryRgb, 90);
            System.out.println("[DEBUG] Creating PDF with primaryColor: " + data.primaryColor + " -> RGB: " + primaryRgb[0] + "," + primaryRgb[1] + "," + primaryRgb[2]);
            System.out.println("[DEBUG] Using locale: " + data.locale + ", invoice title: " + t.invoiceTitle);

            // ========== TOP ACCENT LINE ==========
            content.setNonStrokingColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
            content.addRect(margin, pageHeight - margin, contentWidth, 3);
            content.fill();

            // ========== HEADER: LOGO + INVOICE TITLE ==========
            float headerY = pageHeight - margin - 30;
            float logoHeight = 0; // Track logo height for text positioning

            // Draw logo in the SAME content stream (don't close/reopen)
            if (data.logoData != null && !data.logoData.isEmpty()) {
                try {
                    System.out.println("[Logo] Processing logo data...");

                    byte[] logoBytes = java.util.Base64.getDecoder().decode(data.logoData);
                    PDImageXObject logoImage = PDImageXObject.createFromByteArray(document, logoBytes, "logo");

                    // Get original dimensions
                    float originalWidth = logoImage.getWidth();
                    float originalHeight = logoImage.getHeight();

                    // Maximum allowed dimensions
                    float maxLogoWidth = 180;
                    float maxLogoHeight = 80;

                    // Calculate scale to fit within max dimensions while maintaining aspect ratio
                    float scaleX = maxLogoWidth / originalWidth;
                    float scaleY = maxLogoHeight / originalHeight;
                    float scale = Math.min(scaleX, scaleY);

                    // Don't upscale small logos - only downscale if needed
                    scale = Math.min(scale, 1.0f);

                    float logoWidth = originalWidth * scale;
                    logoHeight = originalHeight * scale;

                    float logoX = margin;
                    float logoY = pageHeight - margin - logoHeight;

                    // Draw logo in the CURRENT content stream (no closing/reopening!)
                    content.drawImage(logoImage, logoX, logoY, logoWidth, logoHeight);

                    System.out.println("[Logo] Successfully drew logo: " + (int)originalWidth + "x" + (int)originalHeight +
                                       " -> " + (int)logoWidth + "x" + (int)logoHeight + " at (" + (int)logoX + "," + (int)logoY + ")");
                } catch (Exception e) {
                    System.err.println("[Logo] Failed to draw logo: " + e.getMessage());
                    e.printStackTrace();
                    // Continue without logo - content stream is still open
                }
            }

            // "INVOICE" title (large, dark) - TRANSLATED
            // Position based on whether there's a logo
            float titleX = margin + (logoHeight > 0 ? 200 : 0);
            content.setNonStrokingColor(0.12f, 0.12f, 0.12f);
            content.beginText();
            content.setFont(font, 32);
            content.newLineAtOffset(titleX, headerY);
            content.showText(t.invoiceTitle);
            content.endText();

            // Invoice details (right aligned)
            float rightX = pageWidth - margin;
            float detailY = headerY + 5;
            float detailLineHeight = 18;

            // Calculate widths for positioning - TRANSLATED
            String invLabel = t.invoiceNumberLabel + ":";
            String invValue = data.orderId;
            String dateLabel = t.dateLabel;
            String dateValue = data.date;

            float invLabelWidth = font.getStringWidth(invLabel) / 1000 * 9;
            float invValueWidth = font.getStringWidth(invValue) / 1000 * 10;
            float dateLabelWidth = font.getStringWidth(dateLabel) / 1000 * 9;
            float dateValueWidth = font.getStringWidth(dateValue) / 1000 * 10;

            // Invoice Number line (label + value together)
            content.setNonStrokingColor(0.4f, 0.4f, 0.4f);
            content.beginText();
            content.setFont(font, 9);
            float invTotalWidth = invLabelWidth + 6 + invValueWidth;
            content.newLineAtOffset(rightX - invTotalWidth, detailY);
            content.showText(invLabel);
            content.endText();

            content.setNonStrokingColor(0.12f, 0.12f, 0.12f);
            content.beginText();
            content.setFont(font, 10);
            content.newLineAtOffset(rightX - invValueWidth, detailY);
            content.showText(invValue);
            content.endText();

            // Date line (label + value together)
            content.setNonStrokingColor(0.4f, 0.4f, 0.4f);
            content.beginText();
            content.setFont(font, 9);
            float dateTotalWidth = dateLabelWidth + 6 + dateValueWidth;
            content.newLineAtOffset(rightX - dateTotalWidth, detailY - detailLineHeight);
            content.showText(dateLabel);
            content.endText();

            content.setNonStrokingColor(0.12f, 0.12f, 0.12f);
            content.beginText();
            content.setFont(font, 10);
            content.newLineAtOffset(rightX - dateValueWidth, detailY - detailLineHeight);
            content.showText(dateValue);
            content.endText();

            // ========== FROM & TO (Two columns) ==========
            float fromY = headerY - 60;
            float columnWidth = (contentWidth - 40) / 2;

            // FROM section - TRANSLATED
            content.setNonStrokingColor(0.5f, 0.5f, 0.5f);
            content.beginText();
            content.setFont(font, 8);
            content.newLineAtOffset(margin, fromY);
            content.showText(t.fromLabel);
            content.endText();

            content.setNonStrokingColor(0.12f, 0.12f, 0.12f);
            content.beginText();
            content.setFont(font, 11);
            content.newLineAtOffset(margin, fromY - 16);
            content.showText(data.companyName);
            content.endText();

            content.setNonStrokingColor(0.4f, 0.4f, 0.4f);
            content.beginText();
            content.setFont(font, 9);
            float fromAddrY = fromY - 32;

            if (data.shopName != null && !data.shopName.isEmpty()) {
                content.newLineAtOffset(margin, fromAddrY);
                content.showText(data.shopName);
                fromAddrY -= 13;
            }
            if (data.shopAddress != null && !data.shopAddress.isEmpty()) {
                String[] addr = splitText(data.shopAddress, 45);
                for (String line : addr) {
                    content.newLineAtOffset(margin, fromAddrY);
                    content.showText(line);
                    fromAddrY -= 13;
                }
            }
            content.endText();

            // BILL TO section - TRANSLATED
            float billToX = margin + columnWidth + 40;

            content.setNonStrokingColor(0.5f, 0.5f, 0.5f);
            content.beginText();
            content.setFont(font, 8);
            content.newLineAtOffset(billToX, fromY);
            content.showText(t.billToLabel);
            content.endText();

            content.setNonStrokingColor(0.12f, 0.12f, 0.12f);
            content.beginText();
            content.setFont(font, 11);
            content.newLineAtOffset(billToX, fromY - 16);
            content.showText(data.customerName);
            content.endText();

            content.setNonStrokingColor(0.4f, 0.4f, 0.4f);
            content.beginText();
            content.setFont(font, 9);
            float billToAddrY = fromY - 32;

            if (data.customerAddress != null && !data.customerAddress.isEmpty()) {
                String[] addr = splitText(data.customerAddress, 45);
                for (String line : addr) {
                    content.newLineAtOffset(billToX, billToAddrY);
                    content.showText(line);
                    billToAddrY -= 13;
                }
            }
            if (data.customerEmail != null && !data.customerEmail.isEmpty()) {
                content.newLineAtOffset(billToX, billToAddrY);
                content.showText(data.customerEmail);
            }
            content.endText();

            // ========== TABLE ==========
            float tableTopY = Math.min(fromAddrY, billToAddrY) - 25;
            float tableHeight = 28;

            // Table header background
            content.setNonStrokingColor(lighterBg[0], lighterBg[1], lighterBg[2]);
            content.addRect(margin, tableTopY - tableHeight, contentWidth, tableHeight);
            content.fill();

            // Table header border
            content.setLineWidth(0.5f);
            content.setStrokingColor(primaryRgb[0] * 0.6f, primaryRgb[1] * 0.6f, primaryRgb[2] * 0.6f);
            content.moveTo(margin, tableTopY - tableHeight);
            content.lineTo(pageWidth - margin, tableTopY - tableHeight);
            content.stroke();

            // Column positions
            float colPos = margin + 12;
            float colItem = colPos + 28;
            float colQty = colItem + 245;
            float colPrice = colQty + 50;
            float colTotal = colPrice + 70;

            // Header text - TRANSLATED
            content.setNonStrokingColor(0.35f, 0.35f, 0.35f);
            content.beginText();
            content.setFont(font, 9);
            float tableHeaderY = tableTopY - 19;

            content.newLineAtOffset(colPos, tableHeaderY);
            content.showText("#");

            content.newLineAtOffset(colItem - colPos, 0);
            content.showText(t.descriptionLabel.toUpperCase());

            String qtyHeader = t.qtyLabel.toUpperCase();
            float qtyHW = font.getStringWidth(qtyHeader) / 1000 * 9;
            content.newLineAtOffset(colQty - colItem - qtyHW, 0);
            content.showText(qtyHeader);

            String priceHeader = t.priceLabel.toUpperCase();
            float priceHW = font.getStringWidth(priceHeader) / 1000 * 9;
            content.newLineAtOffset(colPrice - colQty + qtyHW - priceHW, 0);
            content.showText(priceHeader);

            String totalHeader = t.totalLabel.toUpperCase();
            float totalHW = font.getStringWidth(totalHeader) / 1000 * 9;
            content.newLineAtOffset(colTotal - colPrice + priceHW - totalHW, 0);
            content.showText(totalHeader);

            content.endText();

            // Table items
            float y = tableTopY - tableHeight - 8;
            int itemCount = 0;

            if (data.items != null && !data.items.isEmpty()) {
                for (LineItem item : data.items) {
                    // Subtle row background
                    if (itemCount % 2 == 0) {
                        float[] veryLight = lightenColor(primaryRgb, 96);
                        content.setNonStrokingColor(veryLight[0], veryLight[1], veryLight[2]);
                        content.addRect(margin, y - 3, contentWidth, 20);
                        content.fill();
                    }

                    content.setNonStrokingColor(0.15f, 0.15f, 0.15f);
                    content.beginText();
                    content.setFont(font, 9);

                    String pos = String.valueOf(item.position > 0 ? item.position : (itemCount + 1));
                    content.newLineAtOffset(colPos, y);
                    content.showText(pos);

                    content.newLineAtOffset(colItem - colPos, 0);
                    content.showText(truncateText(item.name, 45));

                    String qtyStr = String.valueOf(item.quantity);
                    float qtyW = font.getStringWidth(qtyStr) / 1000 * 9;
                    content.newLineAtOffset(colQty - colItem - qtyW, 0);
                    content.showText(qtyStr);

                    String priceStr = currencySymbol + String.format("%.2f", item.price);
                    float priceW = font.getStringWidth(priceStr) / 1000 * 9;
                    content.newLineAtOffset(colPrice - colQty + qtyW - priceW, 0);
                    content.showText(priceStr);

                    double lineTotal = item.price * item.quantity;
                    String totalStr = currencySymbol + String.format("%.2f", lineTotal);
                    float totalW = font.getStringWidth(totalStr) / 1000 * 9;
                    content.newLineAtOffset(colTotal - colPrice + priceW - totalW, 0);
                    content.showText(totalStr);

                    content.endText();

                    y -= 20;
                    itemCount++;
                }
            }

            // ========== TOTALS (Right side) ==========
            float totalsY = y - 20;
            float totalsX = pageWidth - margin - 180;

            // Subtotal - TRANSLATED
            content.setNonStrokingColor(0.5f, 0.5f, 0.5f);
            content.beginText();
            content.setFont(font, 9);
            content.newLineAtOffset(totalsX, totalsY);
            content.showText(t.subtotalLabel);
            content.endText();

            content.setNonStrokingColor(0.2f, 0.2f, 0.2f);
            content.beginText();
            content.setFont(font, 10);
            String subStr = currencySymbol + String.format("%.2f", data.subtotal);
            float subW = font.getStringWidth(subStr) / 1000 * 10;
            content.newLineAtOffset(pageWidth - margin - subW, totalsY);
            content.showText(subStr);
            content.endText();

            // Tax - TRANSLATED
            content.setNonStrokingColor(0.5f, 0.5f, 0.5f);
            content.beginText();
            content.setFont(font, 9);
            content.newLineAtOffset(totalsX, totalsY - 20);
            content.showText(t.taxLabel + " (" + (int)data.vatRate + "%):");
            content.endText();

            content.setNonStrokingColor(0.2f, 0.2f, 0.2f);
            content.beginText();
            content.setFont(font, 10);
            String taxStr = currencySymbol + String.format("%.2f", data.tax);
            float taxW = font.getStringWidth(taxStr) / 1000 * 10;
            content.newLineAtOffset(pageWidth - margin - taxW, totalsY - 20);
            content.showText(taxStr);
            content.endText();

            // TOTAL (colored box) - Use translated label
            float totalBoxY = totalsY - 55;
            content.setNonStrokingColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
            content.addRect(totalsX - 10, totalBoxY - 4, 200, 32);
            content.fill();

            content.setNonStrokingColor(1.0f, 1.0f, 1.0f);
            content.beginText();
            content.setFont(font, 12);
            content.newLineAtOffset(totalsX, totalBoxY + 15);
            content.showText(t.totalLabel.toUpperCase() + " " + currencySymbol + String.format("%.2f", data.total));
            content.endText();

            // ========== PAYMENT DETAILS - TRANSLATED ==========
            float payY = totalBoxY - 45;

            content.setNonStrokingColor(0.5f, 0.5f, 0.5f);
            content.beginText();
            content.setFont(font, 8);
            content.newLineAtOffset(margin, payY);
            content.showText(t.paymentDetailsLabel);
            content.endText();

            // Small divider
            content.setLineWidth(0.5f);
            content.setStrokingColor(0.75f, 0.75f, 0.75f);
            content.moveTo(margin, payY - 6);
            content.lineTo(margin + 120, payY - 6);
            content.stroke();

            content.setNonStrokingColor(0.4f, 0.4f, 0.4f);
            content.beginText();
            content.setFont(font, 8);
            float payLabelY = payY - 20;
            float payValueX = margin + 90;

            content.newLineAtOffset(margin, payLabelY);
            content.showText(t.bankLabel);
            content.newLineAtOffset(payValueX - margin, 0);
            content.showText(data.bankName != null && !data.bankName.isEmpty() ? data.bankName : "Your Bank");

            content.newLineAtOffset(margin - payValueX, -14);
            content.showText(t.ibanLabel);
            content.newLineAtOffset(payValueX - margin, 0);
            content.showText(data.iban != null && !data.iban.isEmpty() ? data.iban : "N/A");

            content.newLineAtOffset(margin - payValueX, -14);
            content.showText(t.bicLabel);
            content.newLineAtOffset(payValueX - margin, 0);
            content.showText(data.bic != null && !data.bic.isEmpty() ? data.bic : "N/A");

            if (data.paymentTerms != null && !data.paymentTerms.isEmpty()) {
                content.newLineAtOffset(margin - payValueX, -14);
                content.showText(t.paymentTermsLabel);
                float labelWidth = font.getStringWidth(t.paymentTermsLabel) / 1000 * 8;
                content.newLineAtOffset(payValueX - margin - labelWidth, 0);
                content.showText(": " + data.paymentTerms);
            }
            content.endText();

            // ========== FOOTER ==========
            float footerY = 70;

            content.setLineWidth(0.3f);
            content.setStrokingColor(0.8f, 0.8f, 0.8f);
            content.moveTo(margin, footerY + 12);
            content.lineTo(pageWidth - margin, footerY + 12);
            content.stroke();

            content.setNonStrokingColor(0.5f, 0.5f, 0.5f);
            content.beginText();
            content.setFont(font, 8);
            String thankYou = t.thankYouMessage;
            float thankYouW = font.getStringWidth(thankYou) / 1000 * 8;
            content.newLineAtOffset((pageWidth - thankYouW) / 2, footerY + 4);
            content.showText(thankYou);
            content.endText();

            content.setNonStrokingColor(0.4f, 0.4f, 0.4f);
            content.beginText();
            content.setFont(font, 7);
            String branding = "Powered by PDFify • pdfify.pro";
            float brandingW = font.getStringWidth(branding) / 1000 * 7;
            content.newLineAtOffset(pageWidth - margin - brandingW, footerY - 8);
            content.showText(branding);
            content.endText();

            content.close();

            // Add metadata
            addXMPMetadata(document, data);

            // Return document for further processing (ZUGFeRD embedding, etc.)
            return document;
    }

    /**
     * Embed ZUGFeRD XML as attachment to the PDF
     * Full PDF/A-3b compliant embedding with all required keys
     */
    private static void embedZugferdXml(PDDocument document, String xmlContent) throws IOException {
        // Create file specification for ZUGFeRD XML
        PDComplexFileSpecification fs = new PDComplexFileSpecification();

        // Create embedded file with XML content
        byte[] xmlBytes = xmlContent.getBytes(StandardCharsets.UTF_8);

        // Create COSStream for embedded file data
        COSStream cosStream = document.getDocument().createCOSStream();

        // Write XML content
        java.io.OutputStream os = cosStream.createOutputStream();
        os.write(xmlBytes);
        os.close();

        // Create PDEmbeddedFile from COSStream
        PDEmbeddedFile embeddedFile = new PDEmbeddedFile(cosStream);
        embeddedFile.setSubtype("application/xml");
        fs.setEmbeddedFile(embeddedFile);

        // IMPORTANT: Manually set F and UF keys on the COSDictionary
        // These are required by PDF/A-3b for embedded files
        COSDictionary fsDict = fs.getCOSObject();

        // F key: filename (required)
        fsDict.setString("F", "factur-x.xml");

        // UF key: Unicode filename (required)
        fsDict.setString("UF", "factur-x.xml");

        // AFRelationship: Alternative (required for ZUGFeRD)
        fsDict.setName("AFRelationship", "Alternative");

        System.out.println("DEBUG: F and UF keys set, AFRelationship set to Alternative");

        // Get or create the EmbeddedFiles name tree
        PDDocumentNameDictionary names = new PDDocumentNameDictionary(document.getDocumentCatalog());
        PDEmbeddedFilesNameTreeNode embeddedFiles = names.getEmbeddedFiles();

        if (embeddedFiles == null) {
            embeddedFiles = new PDEmbeddedFilesNameTreeNode();
        }

        // Add the file specification
        Map<String, PDComplexFileSpecification> files = new HashMap<>();
        files.put("factur-x.xml", fs);
        embeddedFiles.setNames(files);

        names.setEmbeddedFiles(embeddedFiles);
        document.getDocumentCatalog().setNames(names);

        // Add AF entry to catalog (required for PDF/A-3b)
        // This tells PDF readers that factur-x.xml is an associated file
        COSArray afArray = new COSArray();
        afArray.add(fs.getCOSObject());
        document.getDocumentCatalog().getCOSObject().setItem("AF", afArray);

        System.out.println("ZUGFeRD XML embedded: factur-x.xml (" + xmlBytes.length + " bytes)");
        System.out.println("  - F (filename): factur-x.xml");
        System.out.println("  - UF (Unicode filename): factur-x.xml");
        System.out.println("  - AFRelationship: Alternative");
        System.out.println("  - MIME type: application/xml");
        System.out.println("  - AF entry added to catalog");
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
        public String zugferdXml; // ZUGFeRD XML content to embed
    }

    public static class LineItem {
        public int position;
        public String name;
        public int quantity;
        public String unitCode;
        public double price;
    }

    /**
     * Translation class for invoice labels
     */
    private static class Translations {
        public String invoiceTitle;
        public String invoiceLabel;
        public String invoiceNumberLabel;
        public String fromLabel;
        public String toLabel;
        public String billToLabel;
        public String dateLabel;
        public String descriptionLabel;
        public String qtyLabel;
        public String priceLabel;
        public String totalLabel;
        public String subtotalLabel;
        public String taxLabel;
        public String ibanLabel;
        public String bicLabel;
        public String bankLabel;
        public String paymentTermsLabel;
        public String paymentDetailsLabel;
        public String thankYouMessage;
    }

    /**
     * Get translations based on locale
     */
    private static Translations getTranslations(String locale) {
        Translations t = new Translations();

        if (locale == null) locale = "en";

        switch (locale) {
            case "de":
                t.invoiceTitle = "RECHNUNG";
                t.invoiceLabel = "Rechnung";
                t.invoiceNumberLabel = "Rechnungsnummer";
                t.fromLabel = "VON";
                t.toLabel = "AN";
                t.billToLabel = "RECHNUNGSEMPFÄNGER";
                t.dateLabel = "Datum:";
                t.descriptionLabel = "Beschreibung";
                t.qtyLabel = "Menge";
                t.priceLabel = "Preis";
                t.totalLabel = "Gesamt";
                t.subtotalLabel = "Zwischensumme:";
                t.taxLabel = "MwSt";
                t.ibanLabel = "IBAN:";
                t.bicLabel = "BIC:";
                t.bankLabel = "Bank:";
                t.paymentTermsLabel = "Zahlungsbedingungen:";
                t.paymentDetailsLabel = "ZAHLUNGSDETAILS";
                t.thankYouMessage = "Vielen Dank für Ihren Einkauf!";
                break;
            case "sl":
                t.invoiceTitle = "RAČUN";
                t.invoiceLabel = "Račun";
                t.invoiceNumberLabel = "Številka računa";
                t.fromLabel = "OD";
                t.toLabel = "ZA";
                t.billToLabel = "PREJEMNIK";
                t.dateLabel = "Datum:";
                t.descriptionLabel = "Opis";
                t.qtyLabel = "Količina";
                t.priceLabel = "Cena";
                t.totalLabel = "Skupaj";
                t.subtotalLabel = "Vmesna vsota:";
                t.taxLabel = "DDV";
                t.ibanLabel = "IBAN:";
                t.bicLabel = "BIC:";
                t.bankLabel = "Banka:";
                t.paymentTermsLabel = "Pogoji plačila:";
                t.paymentDetailsLabel = "PODATKI O PLAČILU";
                t.thankYouMessage = "Hvala za vaš nakup!";
                break;
            default: // English
                t.invoiceTitle = "INVOICE";
                t.invoiceLabel = "Invoice";
                t.invoiceNumberLabel = "Invoice Number";
                t.fromLabel = "FROM";
                t.toLabel = "TO";
                t.billToLabel = "BILL TO";
                t.dateLabel = "Date:";
                t.descriptionLabel = "Description";
                t.qtyLabel = "Qty";
                t.priceLabel = "Price";
                t.totalLabel = "Total";
                t.subtotalLabel = "Subtotal:";
                t.taxLabel = "VAT";
                t.ibanLabel = "IBAN:";
                t.bicLabel = "BIC:";
                t.bankLabel = "Bank:";
                t.paymentTermsLabel = "Payment Terms:";
                t.paymentDetailsLabel = "PAYMENT DETAILS";
                t.thankYouMessage = "Thank you for your business!";
                break;
        }
        return t;
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
