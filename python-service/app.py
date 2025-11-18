from flask import Flask, request, send_file, jsonify
from io import BytesIO
from facturx import generate_facturx_from_file
import json
import traceback
import sys

app = Flask(__name__)

# Configure logging
import logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint"""
    try:
        # Verify factur-x is available
        from facturx import __version__ as facturx_version
        return jsonify({
            "status": "ok",
            "service": "zugferd-generator",
            "facturx_version": facturx_version,
            "python_version": sys.version
        }), 200
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return jsonify({
            "status": "error",
            "error": str(e)
        }), 500

@app.route("/generate-zugferd", methods=["POST"])
def generate_zugferd():
    """
    Generate PDF/A-3b compliant PDF with embedded ZUGFeRD XML.

    Expects:
        - pdfFile: PDF file upload
        - invoiceData: JSON string with:
            - xmlContent: Pre-generated ZUGFeRD XML string
            - orderId: Invoice order ID (optional, for logging)
            - seller.name: Seller name (optional, for PDF metadata)

    Returns:
        PDF/A-3b compliant PDF with embedded ZUGFeRD XML
    """
    try:
        # Get PDF file
        pdf_file = request.files.get("pdfFile")
        if not pdf_file:
            logger.error("Missing pdfFile in request")
            return jsonify({"error": "Missing pdfFile"}), 400

        # Get invoice data
        invoice_data_json = request.form.get("invoiceData")
        if not invoice_data_json:
            logger.error("Missing invoiceData in request")
            return jsonify({"error": "Missing invoiceData"}), 400

        invoice_data = json.loads(invoice_data_json)
        order_id = invoice_data.get("orderId", "unknown")

        logger.info(f"Processing ZUGFeRD generation for order: {order_id}")

        # Get XML content (pre-generated from Node.js)
        xml_content = invoice_data.get("xmlContent")
        if not xml_content:
            logger.error("Missing xmlContent in invoiceData")
            return jsonify({"error": "Missing xmlContent in invoiceData"}), 400

        # Read PDF buffer
        input_pdf_io = BytesIO(pdf_file.read())
        logger.info(f"PDF file size: {len(input_pdf_io.getvalue())} bytes")

        # Convert XML string to bytes if needed
        if isinstance(xml_content, str):
            xml_bytes = xml_content.encode('utf-8')
        else:
            xml_bytes = xml_content

        logger.info(f"XML content size: {len(xml_bytes)} bytes")

        # Prepare PDF metadata
        pdf_metadata = {
            'author': invoice_data.get('seller', {}).get('name', 'PDFify'),
            'title': f"Invoice {order_id}",
            'subject': 'ZUGFeRD Invoice'
        }

        logger.info(f"Generating PDF/A-3b with factur-x, level: EN16931")

        # Generate PDF/A-3b with embedded ZUGFeRD XML using factur-x
        # This handles ALL PDF/A-3b compliance requirements:
        # - AFRelationship metadata
        # - XMP extensions schema
        # - ICC color profile
        # - OutputIntent
        # - Proper file specification
        output_pdf_bytes = generate_facturx_from_file(
            input_pdf_io,
            xml_bytes,
            facturx_level="EN16931",  # ZUGFeRD 2.1.1 / EN16931
            pdf_metadata=pdf_metadata
        )

        logger.info(f"✅ Successfully generated PDF/A-3b for order: {order_id}")
        logger.info(f"Output PDF size: {len(output_pdf_bytes)} bytes")

        output_pdf_io = BytesIO(output_pdf_bytes)
        output_pdf_io.seek(0)

        return send_file(
            output_pdf_io,
            mimetype="application/pdf",
            as_attachment=False,
            download_name=f"invoice-{order_id}.pdf"
        )

    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error: {e}")
        return jsonify({
            "error": "Invalid JSON in invoiceData",
            "details": str(e)
        }), 400
    except Exception as e:
        logger.error(f"❌ ZUGFeRD generation error: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            "error": "ZUGFeRD generation failed",
            "details": str(e),
            "traceback": traceback.format_exc()
        }), 500

@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Endpoint not found"}), 404

@app.errorhandler(500)
def internal_error(e):
    logger.error(f"Internal server error: {e}")
    return jsonify({"error": "Internal server error"}), 500

if __name__ == "__main__":
    logger.info("🚀 Starting ZUGFeRD PDF/A-3b Generation Service")
    logger.info("Endpoints available:")
    logger.info("  - GET  /health")
    logger.info("  - POST /generate-zugferd")
    app.run(host="0.0.0.0", port=5000, debug=True)
