package com.yourcompany;

import java.io.File;
import java.io.IOException;

import org.apache.pdfbox.preflight.ValidationResult;
import org.apache.pdfbox.preflight.ValidationResult.ValidationError;
import org.apache.pdfbox.preflight.exception.ValidationException;
import org.apache.pdfbox.preflight.parser.PreflightParser;
import org.apache.pdfbox.preflight.PreflightDocument;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;

public class PdfA3bFixer {
    public static void main(String[] args) throws IOException {
        if (args.length != 2) {
            System.err.println("Usage: PdfA3bFixer <input.pdf> <output.pdf>");
            System.exit(1);
        }

        File inputFile = new File(args[0]);
        File outputFile = new File(args[1]);

        PreflightParser parser = new PreflightParser(inputFile);
        PreflightDocument preflightDoc = null;

        try {
            parser.parse();
            preflightDoc = parser.getPreflightDocument();

            preflightDoc.validate();
            ValidationResult result = preflightDoc.getResult();

            if (!result.isValid()) {
                System.err.println("PDF/A validation errors:");
                for (ValidationError error : result.getErrorsList()) {
                    System.err.println(error.getErrorCode() + " : " + error.getDetails());
                }

                // Fix missing ID
                COSDictionary trailerDict = (COSDictionary) preflightDoc.getDocument().getTrailer().getCOSObject();
                if (trailerDict.getItem(COSName.ID) == null) {
                    trailerDict.setItem(COSName.ID, preflightDoc.getDocument().getDocumentID());
                }
            }

            preflightDoc.save(outputFile);

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
