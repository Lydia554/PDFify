package com.yourcompany;

import java.io.File;
import java.io.IOException;
import org.apache.pdfbox.preflight.PreflightDocument;
import org.apache.pdfbox.preflight.parser.PreflightParser;
import org.apache.pdfbox.preflight.ValidationResult;
import org.apache.pdfbox.preflight.exception.ValidationException;
import org.apache.pdfbox.pdmodel.PDDocument;

public class PdfA3bFixer {
    public static void main(String[] args) throws IOException, ValidationException {
        if(args.length != 2) {
            System.err.println("Usage: PdfA3bFixer <input.pdf> <output.pdf>");
            System.exit(1);
        }

        File inputFile = new File(args[0]);
        File outputFile = new File(args[1]);

        PreflightParser parser = new PreflightParser(inputFile);
        parser.parse();
        PreflightDocument preflightDoc = parser.getPreflightDocument();
        preflightDoc.validate();

        ValidationResult result = preflightDoc.getResult();
        PDDocument doc = preflightDoc.getDocument();

        if(!result.isValid()) {
            // Fix missing ID
            if(doc.getDocumentCatalog().getCOSObject().getItem("ID") == null) {
                doc.getDocumentCatalog().getCOSObject().setItem("ID", doc.getDocument().getTrailer().getItem("ID"));
            }
            // TODO: embed fonts properly, fix XMP metadata
        }

        doc.save(outputFile);
        doc.close();
        preflightDoc.close();
    }
}
