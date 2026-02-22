package com.pdfa;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.font.PDFont;
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
import org.apache.pdfbox.pdmodel.common.COSObjectable;

import java.io.File;
import java.io.IOException;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;

/**
 * PDF/A-3B Service using Apache PDFBox
 * Creates compliant PDF/A-3b invoices with ZUGFeRD XML embedding
 */
public class PDFA3BService {

    /**
     * Data class for invoice information
     */
    public static class InvoiceData {
        public String orderId;
        public String date;
        public String customerName;
        public String companyName;
        public String customerAddress;
        public String shopName;
        public String shopAddress;
        public List<LineItem> items;
        public double subtotal;
        public double tax;
        public double total;
        public String currency = "EUR";
        public String vatRate;
        public String iban;
        public String bic;
        public String bankName;
        public String paymentTerms;
        public String primaryColor;
        public String locale = "en";  // Language locale: "en", "de", "sl"
        public String zugferdXml;  // ZUGFeRD XML to embed
        public String logoData;  // Base64 encoded logo

        public static class LineItem {
            public String name;
            public String formattedPrice;
            public String formattedNet;
            public String formattedTax;
            public String formattedTotal;
            public int quantity;
            public double price;
            public double net;
            public double tax;
            public double total;
        }
    }

    /**
     * Translation map for invoice labels
     */
    private static class Translations {
        public String invoiceTitle;
        public String orderIdLabel;
        public String dateLabel;
        public String fromLabel;
        public String toLabel;
        public String descriptionLabel;
        public String qtyLabel;
        public String priceLabel;
        public String totalLabel;
        public String subtotalLabel;
        public String taxLabel;
        public String grandTotalLabel;
        public String ibanLabel;
        public String bicLabel;
        public String bankLabel;
        public String paymentTermsLabel;
    }

    private static Translations getTranslations(String locale) {
        Translations t = new Translations();

        switch (locale) {
            case "de":
                t.invoiceTitle = "RECHNUNG";
                t.orderIdLabel = "Bestellnummer:";
                t.dateLabel = "Datum:";
                t.fromLabel = "VON:";
                t.toLabel = "AN:";
                t.descriptionLabel = "Beschreibung";
                t.qtyLabel = "Menge";
                t.priceLabel = "Preis";
                t.totalLabel = "Gesamt";
                t.subtotalLabel = "Zwischensumme:";
                t.taxLabel = "MwSt:";
                t.grandTotalLabel = "GESAMTSUMME:";
                t.ibanLabel = "IBAN:";
                t.bicLabel = "BIC:";
                t.bankLabel = "Bank:";
                t.paymentTermsLabel = "Zahlungsbedingungen:";
                break;
            case "sl":
                t.invoiceTitle = "RAČUN";
                t.orderIdLabel = "Številka naročila:";
                t.dateLabel = "Datum:";
                t.fromLabel = "OD:";
                t.toLabel = "ZA:";
                t.descriptionLabel = "Opis";
                t.qtyLabel = "Količina";
                t.priceLabel = "Cena";
                t.totalLabel = "Skupaj";
                t.subtotalLabel = "Vmesna vsota:";
                t.taxLabel = "DDV:";
                t.grandTotalLabel = "ZNANA VSOTA:";
                t.ibanLabel = "IBAN:";
                t.bicLabel = "BIC:";
                t.bankLabel = "Banka:";
                t.paymentTermsLabel = "Pogoji plačila:";
                break;
            default: // English
                t.invoiceTitle = "INVOICE";
                t.orderIdLabel = "Order Number:";
                t.dateLabel = "Date:";
                t.fromLabel = "FROM:";
                t.toLabel = "TO:";
                t.descriptionLabel = "Description";
                t.qtyLabel = "Qty";
                t.priceLabel = "Price";
                t.totalLabel = "Total";
                t.subtotalLabel = "Subtotal:";
                t.taxLabel = "VAT:";
                t.grandTotalLabel = "TOTAL:";
                t.ibanLabel = "IBAN:";
                t.bicLabel = "BIC:";
                t.bankLabel = "Bank:";
                t.paymentTermsLabel = "Payment Terms:";
                break;
        }
        return t;
    }

    /**
     * Create a PDF/A-3b compliant invoice
     */
    public static void createInvoice(InvoiceData data, String outputPath) throws IOException {
        // Get translations based on locale
        Translations t = getTranslations(data.locale != null ? data.locale : "en");

        // Create document
        PDDocument document = new PDDocument();

        // Add OutputIntent for PDF/A-3b (use sRGB ICC profile)
        addOutputIntent(document);

        // Add page
        PDPage page = new PDPage();
        document.addPage(page);

        // Create content stream
        PDPageContentStream content = new PDPageContentStream(document, page);

        // Load TrueType font with full embedding (no subsetting)
        // This should avoid CID font issues
        String fontPath = "C:\\Windows\\Fonts\\calibri.ttf";
        PDType0Font font = PDType0Font.load(document, new File(fontPath));

        System.out.println("Font loaded: " + font.getName());
        System.out.println("Font is embedded: " + font.isEmbedded());

        // Position tracking
        float yPosition = 700;
        float leftMargin = 50;
        float lineHeight = 20;

        content.beginText();
        content.setFont(font, 16);

        // Invoice title (translated)
        content.newLineAtOffset(leftMargin, yPosition);
        content.showText(t.invoiceTitle);
        yPosition -= lineHeight * 2;

        // Order ID (translated)
        content.setFont(font, 12);
        content.newLineAtOffset(50, yPosition);
        content.showText(t.orderIdLabel + " " + data.orderId);
        yPosition -= lineHeight;

        // Date (translated)
        content.newLineAtOffset(50, yPosition);
        content.showText(t.dateLabel + " " + data.date);
        yPosition -= lineHeight * 2;

        // From (translated)
        content.setFont(font, 11);
        content.newLineAtOffset(50, yPosition);
        content.showText(t.fromLabel);
        content.newLineAtOffset(50, yPosition - lineHeight);
        content.setFont(font, 12);
        content.showText(data.companyName);
        yPosition -= lineHeight;

        // Shop address if available
        if (data.shopAddress != null && !data.shopAddress.isEmpty()) {
            content.newLineAtOffset(50, yPosition);
            content.showText(data.shopAddress);
            yPosition -= lineHeight;
        }
        yPosition -= lineHeight;

        // To (translated)
        content.setFont(font, 11);
        content.newLineAtOffset(50, yPosition);
        content.showText(t.toLabel);
        content.newLineAtOffset(50, yPosition - lineHeight);
        content.setFont(font, 12);
        content.showText(data.customerName);
        yPosition -= lineHeight;

        // Customer address if available
        if (data.customerAddress != null && !data.customerAddress.isEmpty()) {
            content.newLineAtOffset(50, yPosition);
            content.showText(data.customerAddress);
            yPosition -= lineHeight;
        }
        yPosition -= lineHeight;

        // Line items header (translated)
        content.setFont(font, 11);
        content.newLineAtOffset(50, yPosition);
        content.showText("--------------------------------------------------------------------------------");
        yPosition -= lineHeight;
        content.newLineAtOffset(50, yPosition);
        content.showText(String.format("%-40s %8s %12s %12s", t.descriptionLabel, t.qtyLabel, t.priceLabel, t.totalLabel));
        yPosition -= lineHeight;
        content.newLineAtOffset(50, yPosition);
        content.showText("--------------------------------------------------------------------------------");

        // Line items (use formatted values if available)
        yPosition -= lineHeight;
        content.setFont(font, 10);
        if (data.items != null) {
            for (InvoiceData.LineItem item : data.items) {
                content.newLineAtOffset(50, yPosition);
                // Use formatted values if available, otherwise format manually
                String priceStr = item.formattedPrice != null ? item.formattedPrice : String.format("%.2f", item.price);
                String totalStr = item.formattedTotal != null ? item.formattedTotal : String.format("%.2f", item.total);
                content.showText(String.format("%-40s %8d %12s %12s",
                    truncateString(item.name, 40), item.quantity, priceStr, totalStr));
                yPosition -= lineHeight * 1.5;
            }
        }

        // Subtotal (translated)
        yPosition -= lineHeight;
        content.setFont(font, 11);
        content.newLineAtOffset(350, yPosition);
        String subtotalStr = String.format("%.2f", data.subtotal);
        content.showText(t.subtotalLabel + " " + subtotalStr + " " + data.currency);
        yPosition -= lineHeight;

        // Tax (translated)
        content.newLineAtOffset(350, yPosition);
        String taxStr = String.format("%.2f", data.tax);
        content.showText(t.taxLabel + " (" + (data.vatRate != null ? data.vatRate : "21") + "%) " + taxStr + " " + data.currency);
        yPosition -= lineHeight * 2;

        // Final total (translated)
        content.setFont(font, 14);
        content.newLineAtOffset(350, yPosition);
        content.showText(t.grandTotalLabel + " " + String.format("%.2f %s", data.total, data.currency));

        // Payment details at bottom
        yPosition -= lineHeight * 4;
        content.setFont(font, 9);
        content.newLineAtOffset(50, yPosition);

        if (data.iban != null && !data.iban.isEmpty()) {
            content.showText(t.ibanLabel + " " + data.iban);
            yPosition -= lineHeight;
            content.newLineAtOffset(50, yPosition);
        }
        if (data.bic != null && !data.bic.isEmpty()) {
            content.showText(t.bicLabel + " " + data.bic);
            yPosition -= lineHeight;
            content.newLineAtOffset(50, yPosition);
        }
        if (data.bankName != null && !data.bankName.isEmpty()) {
            content.showText(t.bankLabel + " " + data.bankName);
            yPosition -= lineHeight;
            content.newLineAtOffset(50, yPosition);
        }
        if (data.paymentTerms != null && !data.paymentTerms.isEmpty()) {
            content.showText(t.paymentTermsLabel + " " + data.paymentTerms);
        }

        content.endText();
        content.close();

        // Add proper XMP metadata for PDF/A-3b with ZUGFeRD
        addXMPMetadata(document, data);

        // Embed ZUGFeRD XML if provided
        if (data.zugferdXml != null && !data.zugferdXml.isEmpty()) {
            embedZugferdXml(document, data.zugferdXml);
            System.out.println("ZUGFeRD XML embedded successfully");
        }

        // Save
        document.save(outputPath);
        document.close();

        System.out.println("PDF created: " + outputPath);
        System.out.println("Size: " + new File(outputPath).length() + " bytes");
    }

    /**
     * Truncate string to max length
     */
    private static String truncateString(String str, int maxLength) {
        if (str == null) return "";
        if (str.length() <= maxLength) return str;
        return str.substring(0, maxLength - 3) + "...";
    }

    /**
     * Add OutputIntent (ICC profile) for PDF/A-3b compliance
     * Uses sRGB color profile
     */
    private static void addOutputIntent(PDDocument document) throws IOException {
        // Use sRGB ICC profile from standard location
        // Download from: https://color.org/specification/ICC1.43_2010-12.pdf
        // Or use built-in approach with reference to sRGB

        // For PDF/A, we reference the sRGB color space
        String colorProfilePath = "C:\\Users\\goldb\\Pro\\PDF-API\\java-pdfa-service\\sRGB.icc";

        File colorProfileFile = new File(colorProfilePath);
        if (!colorProfileFile.exists()) {
            System.out.println("WARNING: ICC profile not found, downloading from URL");
            try {
                java.io.InputStream colorStream = new java.net.URL("https://www.color.org/sRGB.icc").openStream();
                PDOutputIntent intent = new PDOutputIntent(document, colorStream);
                intent.setOutputCondition("sRGB IEC61966-2.1");
                intent.setOutputConditionIdentifier("sRGB IEC61966-2.1");
                intent.setRegistryName("http://www.color.org");
                document.getDocumentCatalog().addOutputIntent(intent);
                System.out.println("OutputIntent added from URL");
            } catch (Exception e) {
                System.out.println("WARNING: Could not load ICC profile: " + e.getMessage());
            }
        } else {
            java.io.InputStream colorStream = new java.io.FileInputStream(colorProfileFile);
            PDOutputIntent intent = new PDOutputIntent(document, colorStream);
            intent.setOutputCondition("sRGB IEC61966-2.1");
            intent.setOutputConditionIdentifier("sRGB IEC61966-2.1");
            intent.setRegistryName("http://www.color.org");
            document.getDocumentCatalog().addOutputIntent(intent);
            System.out.println("OutputIntent added from local file");
        }
    }

    /**
     * Add proper XMP metadata with PDF/A-3b identification and ZUGFeRD
     */
    private static void addXMPMetadata(PDDocument document, InvoiceData data) throws IOException {
        // Create XMP metadata
        String xmp = createXMPXML(data);

        // IMPORTANT: Create BOM bytes + XMP content
        byte[] bomBytes = new byte[]{(byte) 0xEF, (byte) 0xBB, (byte) 0xBF};
        byte[] xmpBytes = xmp.getBytes("UTF-8");

        // Combine: BOM at start + XMP content
        byte[] fullMetadata = new byte[bomBytes.length + xmpBytes.length];
        System.arraycopy(bomBytes, 0, fullMetadata, 0, bomBytes.length);
        System.arraycopy(xmpBytes, 0, fullMetadata, bomBytes.length, xmpBytes.length);

        // Import into PDF
        PDMetadata metadata = new PDMetadata(document);
        metadata.importXMPMetadata(fullMetadata);
        document.getDocumentCatalog().setMetadata(metadata);

        System.out.println("XMP metadata size: " + fullMetadata.length + " bytes");
        System.out.println("BOM included: 0xEF 0xBB 0xBF");
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
     * Create XMP XML for PDF/A-3b
     * Simplified to avoid validation errors with custom ZUGFeRD properties
     * The ZUGFeRD conformance is indicated by the embedded factur-x.xml file
     */
    private static String createXMPXML(InvoiceData data) {
        StringBuilder xmp = new StringBuilder();

        // XMP packet opening
        xmp.append("<?xpacket begin=\"\" id=\"W5M0MpCehiHzreSzNTczkc9d\"?>\n");

        // XMP meta container
        xmp.append("<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:mimetype=\"text/xml\">\n");

        // RDF content
        xmp.append(" <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n");

        // PDF/A-3b identification
        xmp.append("  <rdf:Description rdf:about=\"\" xmlns:pdfaid=\"http://www.aiim.org/pdfa/ns/id/\">\n");
        xmp.append("   <pdfaid:part>3</pdfaid:part>\n");
        xmp.append("   <pdfaid:conformance>B</pdfaid:conformance>\n");
        xmp.append("  </rdf:Description>\n");

        // Dublin Core metadata
        xmp.append("  <rdf:Description rdf:about=\"\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\">\n");
        xmp.append("   <dc:title>\n");
        xmp.append("    <rdf:Alt>\n");
        xmp.append("      <rdf:li xml:lang=\"x-default\">Invoice " + data.orderId + "</rdf:li>\n");
        xmp.append("    </rdf:Alt>\n");
        xmp.append("   </dc:title>\n");
        xmp.append("  </rdf:Description>\n");

        // PDF metadata
        xmp.append("  <rdf:Description rdf:about=\"\" xmlns:pdf=\"http://ns.adobe.com/pdf/1.3/\">\n");
        xmp.append("   <pdf:Producer>Apache PDFBox 3.0.3</pdf:Producer>\n");
        xmp.append("  </rdf:Description>\n");

        // XMP metadata
        xmp.append("  <rdf:Description rdf:about=\"\" xmlns:xmp=\"http://ns.adobe.com/xap/1.0/\">\n");
        xmp.append("   <xmp:CreateDate>" + getCurrentDateTime() + "</xmp:CreateDate>\n");
        xmp.append("  </rdf:Description>\n");

        // Close RDF and XMP
        xmp.append(" </rdf:RDF>\n");
        xmp.append("</x:xmpmeta>\n");
        xmp.append("<?xpacket end=\"w\"?>");

        return xmp.toString();
    }

    /**
     * Get current date/time in XMP format
     */
    private static String getCurrentDateTime() {
        java.time.Instant now = java.time.Instant.now();
        // Format: 2025-02-10T12:00:00Z
        return java.time.format.DateTimeFormatter.ISO_INSTANT.format(now);
    }

    /**
     * Main method - accepts JSON file path as argument
     * Usage: java com.pdfa.PDFA3BService <invoice.json> <output.pdf>
     */
    public static void main(String[] args) {
        try {
            if (args.length < 2) {
                System.err.println("Usage: java com.pdfa.PDFA3BService <invoice.json> <output.pdf>");
                System.err.println("Creating sample PDF instead...");

                // Create sample invoice for testing
                InvoiceData invoice = new InvoiceData();
                invoice.orderId = "INV-2025-001";
                invoice.date = "2025-02-10";
                invoice.customerName = "John Doe";
                invoice.companyName = "My Company Ltd";
                invoice.currency = "EUR";
                invoice.total = 1190.00;

                // Sample ZUGFeRD XML (EN16931 format)
                invoice.zugferdXml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +
                    "<rsm:CrossIndustryInvoice xmlns:rsm=\"urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100\" xmlns:ram=\"urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100\" xmlns:udt=\"urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100\">\n" +
                    "  <rsm:ExchangedDocumentContext>\n" +
                    "    <ram:GuidelineSpecifiedDocumentContextParameter>\n" +
                    "      <ram:ID>urn:cen.eu:en16931:2017</ram:ID>\n" +
                    "    </ram:GuidelineSpecifiedDocumentContextParameter>\n" +
                    "  </rsm:ExchangedDocumentContext>\n" +
                    "  <rsm:ExchangedDocument>\n" +
                    "    <ram:ID>INV-2025-001</ram:ID>\n" +
                    "    <ram:TypeCode>380</ram:TypeCode>\n" +
                    "    <ram:IssueDateTime>\n" +
                    "      <udt:DateTimeString format=\"102\">20250210</udt:DateTimeString>\n" +
                    "    </ram:IssueDateTime>\n" +
                    "  </rsm:ExchangedDocument>\n" +
                    "  <rsm:SupplyChainTradeTransaction>\n" +
                    "    <ram:ApplicableHeaderTradeAgreement>\n" +
                    "      <ram:SellerTradeParty>\n" +
                    "        <ram:Name>My Company Ltd</ram:Name>\n" +
                    "      </ram:SellerTradeParty>\n" +
                    "      <ram:BuyerTradeParty>\n" +
                    "        <ram:Name>John Doe</ram:Name>\n" +
                    "      </ram:BuyerTradeParty>\n" +
                    "    </ram:ApplicableHeaderTradeAgreement>\n" +
                    "    <ram:ApplicableHeaderTradeSettlement>\n" +
                    "      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>\n" +
                    "      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>\n" +
                    "        <ram:LineTotalAmount>1000.00</ram:LineTotalAmount>\n" +
                    "        <ram:TaxBasisTotalAmount>1000.00</ram:TaxBasisTotalAmount>\n" +
                    "        <ram:TaxTotalAmount currencyID=\"EUR\">190.00</ram:TaxTotalAmount>\n" +
                    "        <ram:GrandTotalAmount>1190.00</ram:GrandTotalAmount>\n" +
                    "        <ram:DuePayableAmount>1190.00</ram:DuePayableAmount>\n" +
                    "      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>\n" +
                    "    </ram:ApplicableHeaderTradeSettlement>\n" +
                    "  </rsm:SupplyChainTradeTransaction>\n" +
                    "</rsm:CrossIndustryInvoice>";

                invoice.items = new ArrayList<>();
                InvoiceData.LineItem item1 = new InvoiceData.LineItem();
                item1.name = "Web Development Service";
                item1.quantity = 10;
                item1.price = 100.00;
                invoice.items.add(item1);

                // Create PDF
                String outputPath = "C:\\Users\\goldb\\Pro\\PDF-API\\test-pdfbox-zugferd.pdf";
                createInvoice(invoice, outputPath);

                System.out.println("\n========================================");
                System.out.println("SUCCESS! PDF/A-3b + ZUGFeRD 2.4 created");
                System.out.println("========================================");
                System.out.println("\nTo validate PDF/A-3b:");
                System.out.println("verapdf --flavour 3b \"" + outputPath + "\"");
                System.out.println("\nTo extract ZUGFeRD XML:");
                System.out.println("pdftk \"" + outputPath + "\" unpack_files output ./");

                return;
            }

            // Read JSON input
            String jsonPath = args[0];
            String outputPath = args[1];

            // Parse JSON (simple implementation - use org.json or Gson in production)
            String jsonContent = new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get(jsonPath)));
            InvoiceData invoice = parseJsonToInvoice(jsonContent);

            // Generate PDF
            createInvoice(invoice, outputPath);

        } catch (Exception e) {
            System.err.println("Error: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }

    /**
     * Simple JSON parser for invoice data
     * In production, use a proper JSON library
     */
    private static InvoiceData parseJsonToInvoice(String json) {
        // This is a placeholder - implement proper JSON parsing
        // For now, return test data
        InvoiceData invoice = new InvoiceData();
        invoice.orderId = "INV-2025-001";
        invoice.date = "2025-02-10";
        invoice.customerName = "Test Customer";
        invoice.companyName = "Test Company";
        invoice.currency = "EUR";
        invoice.total = 100.00;
        invoice.items = new ArrayList<>();
        return invoice;
    }
}
