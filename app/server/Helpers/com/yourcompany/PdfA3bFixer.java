package com.yourcompany;

import java.io.File;
import java.io.IOException;
import org.apache.pdfbox.preflight.PreflightDocument;
import org.apache.pdfbox.preflight.Format;
import org.apache.pdfbox.preflight.parser.PreflightParser;
import org.apache.pdfbox.preflight.ValidationResult;
import org.apache.pdfbox.preflight.exception.SyntaxValidationException;
import org.apache.pdfbox.preflight.exception.ValidationException;
import org.apache.pdfbox.pdmodel.PDDocument;

public class PdfA3bFixer {
    public static void main(String[] args) throws IOException {
        if(args.length != 2) {
            System.err.println("Usage: PdfA3bFixer <input.pdf> <output.pdf>");
            System.exit(1);
        }

        File inputFile = new File(args[0]);
        File outputFile = new File(args[1]);

        ValidationResult result = null;
        PreflightDocument preflightDoc = null;

        try {
            PreflightParser parser = new PreflightParser(inputFile);
            // Parse and cast to PreflightDocument (PDFBox 3.x API)
            // Note: Preflight only supports PDF/A-1B and PDF/A-1A
            PDDocument doc = parser.parse(Format.PDF_A1B);
            preflightDoc = (PreflightDocument) doc;

            // Validate and get result
            result = preflightDoc.validate();

            if(!result.isValid()) {
                System.err.println("PDF/A validation errors:");
                for (ValidationResult.ValidationError error : result.getErrorsList()) {
                    System.err.println(error.getErrorCode() + " : " + error.getDetails());
                }

                // Fix missing ID
                if(preflightDoc.getDocumentCatalog().getCOSObject().getItem("ID") == null) {
                    preflightDoc.getDocumentCatalog().getCOSObject().setItem("ID",
                        preflightDoc.getDocument().getTrailer().getItem("ID"));
                }
                // TODO: embed fonts properly, fix XMP metadata
            }

            preflightDoc.save(outputFile);

        } catch (SyntaxValidationException e) {
            System.err.println("Syntax validation failed: " + e.getMessage());
            result = e.getResult();
            if (result != null) {
                for (ValidationResult.ValidationError error : result.getErrorsList()) {
                    System.err.println(error.getErrorCode() + " : " + error.getDetails());
                }
            }
            System.exit(1);
        } catch (ValidationException e) {
            System.err.println("Validation failed: " + e.getMessage());
            System.exit(1);
        } finally {
            if (preflightDoc != null) {
                preflightDoc.close();
            }
        }
    }
}
