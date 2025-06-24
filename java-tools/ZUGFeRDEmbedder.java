import org.mustangproject.ZUGFeRD.ZUGFeRDExporterFromA1;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Paths;

public class ZUGFeRDEmbedder {
    public static void main(String[] args) {
        if (args.length != 3) {
            System.out.println("Usage: java ZUGFeRDEmbedder input.pdf invoice.xml output.pdf");
            return;
        }

        String inputPDF = args[0];
        String xmlPath = args[1];
        String outputPDF = args[2];

        try {
    byte[] xmlBytes = Files.readAllBytes(Paths.get(xmlPath)); // read XML bytes

    ZUGFeRDExporterFromA1 zf = new ZUGFeRDExporterFromA1();
    zf.load(inputPDF)
      .setZUGFeRDVersion(21)
      .setProfile("EN16931")
      .setXML(xmlBytes);

    zf.export(outputPDF);
} catch (Exception e) {
    System.err.println("Error embedding XML: " + e.getMessage());
    e.printStackTrace();
}

    }
}
