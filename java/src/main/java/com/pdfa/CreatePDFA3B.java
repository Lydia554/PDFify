import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDPageContentStream.*;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.pdfbox.pdmodel.graphics.state.PDExtendedGraphicsState;

import java.io.File;
import java.io.IOException;
import java.io.ByteArrayOutputStream;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.util.Calendar;
import java.util.GregorianCalendar;

import javax.xml.transform.OutputKeys;
import javax.xml.transform.Transformer;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.stream.StreamResult;
import javax.xml.transform.stream.StreamSource;
import javax.xml.transform.dom.DOMSource;

import org.w3c.dom.Document;
import org.w3c.dom.Element;

/**
 * Create PDF/A-3b with proper XMP metadata using Apache PDFBox
 * This should pass veraPDF validation
 */
public class CreatePDFA3B {

    public static void main(String[] args) {
        try {
            System.out.println("Creating PDF/A-3b invoice...\n");

            // Create PDF document
            PDDocument doc = new PDDocument();

            // Add a page
            PDPage page = new PDPage();
            doc.addPage(page);

            // Create content stream
            PDPageContentStream content = new PDPageContentStream(doc, page);
            content.beginText();
            content.setFont(Standard14Fonts.HELVETICA_BOLD, 12);
            content.newLineAtOffset(700, 700);
            content.showText("Invoice: INV-2025-001");
            content.newLineAtOffset(-15);
            content.showText("Date: 2025-02-10");
            content.newLineAtOffset(-15);
            content.showText("Seller: My Company Ltd");
            content.newLineAtOffset(-15);
            content.showText("Buyer: John Doe");
            content.newLineAtOffset(-15);
            content.showText("Total: 1190.00 EUR");
            content.endText();
            content.close();

            // Create proper XMP metadata with BOM in correct position
            String xmp = createProperXMP();

            // Convert XMP to bytes WITH BOM at start
            byte[] bomBytes = new byte[]{(byte) 0xEF, (byte) 0xBB, (byte) 0xBF};
            byte[] xmpBytes = xmp.getBytes("UTF-8");

            // Combine: BOM + XMP content
            byte[] fullMetadata = new byte[bomBytes.length + xmpBytes.length];
            System.arraycopy(bomBytes, 0, fullMetadata, 0, bomBytes.length);
            System.arraycopy(xmpBytes, 0, fullMetadata, bomBytes.length, xmpBytes.length);

            // Import metadata into PDF
            PDMetadata metadata = new PDMetadata(doc);
            metadata.importXMPMetadata(fullMetadata);
            doc.getDocumentCatalog().setMetadata(metadata);

            System.out.println("XMP metadata added");
            System.out.println("Total metadata size: " + fullMetadata.length + " bytes");
            System.out.println("BOM bytes: [" + bomBytes[0] + ", " + bomBytes[1] + ", " + bomBytes[2] + "]");

            // Save to file
            File outputFile = new File("C:\\Users\\goldb\\Pro\\PDF-API\\test-pdfbox-pdfa3b.pdf");
            doc.save(outputFile);
            doc.close();

            System.out.println("\nSaved to: " + outputFile.getAbsolutePath());
            System.out.println("\nRun veraPDF validation:");
            System.out.println("verapdf --flavour 3b \"" + outputFile.getAbsolutePath() + "\"");

        } catch (Exception e) {
            System.err.println("Error: " + e.getMessage());
            e.printStackTrace();
        }
    }

    /**
     * Create proper XMP metadata for PDF/A-3b
     * The XMP specification says BOM should come BEFORE <?xpacket, not inside it
     */
    private static String createProperXMP() {
        StringBuilder xmp = new StringBuilder();

        // Note: When we import with metadata.importXMPMetadata(),
        // PDFBox will handle the BOM for us if we provide proper XMP content
        // So we just create the XMP without worrying about BOM here

        xmp.append("<?xpacket begin=\"\" id=\"W5M0MpCehiHzreSzNTczkc9d\"?>\n");
        xmp.append("<x:xmpmeta xmlns:x=\"adobe:ns:meta/\">\n");
        xmp.append(" <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n");
        xmp.append("  <rdf:Description rdf:about=\"\" xmlns:pdfaid=\"http://www.aiim.org/pdfa/ns/id/\">\n");
        xmp.append("   <pdfaid:part>3</pdfaid:part>\n");
        xmp.append("   <pdfaid:conformance>B</pdfaid:conformance>\n");
        xmp.append("  </rdf:Description>\n");
        xmp.append(" </rdf:RDF>\n");
        xmp.append("</x:xmpmeta>\n");
        xmp.append("<?xpacket end=\"w\"?>");

        return xmp.toString();
    }
}
