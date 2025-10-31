from flask import Flask, request, send_file, jsonify
from facturx import generate_facturx_from_file
import tempfile, os, json, logging

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50 MB

# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ZUGFeRD")

@app.route("/generate-zugferd", methods=["POST"])
def generate_zugferd():
    logger.info("=== Incoming Request ===")
    logger.info("Content-Type: %s", request.content_type)
    logger.info("Form keys: %s", list(request.form.keys()))
    logger.info("Files keys: %s", list(request.files.keys()))

    if 'pdfFile' not in request.files:
        logger.error("Missing 'pdfFile'")
        return jsonify({"error": "Missing 'pdfFile'"}), 400
    if 'invoiceData' not in request.form:
        logger.error("Missing 'invoiceData'")
        return jsonify({"error": "Missing 'invoiceData'"}), 400

    pdf_file = request.files['pdfFile']
    invoice_data_raw = request.form['invoiceData']

    try:
        invoice_data = json.loads(invoice_data_raw)
    except Exception as e:
        logger.error("Invalid invoiceData JSON: %s", e)
        return jsonify({"error": f"Invalid JSON: {str(e)}"}), 400

    logger.info("Invoice data keys: %s", list(invoice_data.keys()))

    try:
        # Read PDF once
        pdf_bytes = pdf_file.read()
        logger.info("Received PDF: name=%s, size=%d bytes", pdf_file.filename, len(pdf_bytes))

        # Create XML dynamically
        xml_str = f"""<?xml version="1.0" encoding="UTF-8"?>
<Invoice>
  <ID>{invoice_data.get('orderId')}</ID>
  <Customer>{invoice_data.get('customerName')}</Customer>
  <Total>{invoice_data.get('total')}</Total>
</Invoice>"""
        xml_bytes = xml_str.encode("utf-8")

        # Use temp files for PDF + XML
        with tempfile.NamedTemporaryFile(suffix=".pdf") as pdf_in, \
             tempfile.NamedTemporaryFile(suffix=".xml") as xml_in, \
             tempfile.NamedTemporaryFile(suffix=".pdf") as pdf_out:

            pdf_in.write(pdf_bytes)
            pdf_in.flush()
            xml_in.write(xml_bytes)
            xml_in.flush()

            try:
                logger.info("Generating Factur-X PDF...")
                generate_facturx_from_file(pdf_in.name, xml_in.name, pdf_out.name)
            except Exception as e:
                logger.exception("❌ FacturX generation failed")
                return jsonify({"error": f"FacturX generation failed: {str(e)}"}), 500

            pdf_out.seek(0)
            logger.info("✅ ZUGFeRD PDF generated successfully")

            # Stream file back to client safely
            return send_file(
                pdf_out,
                mimetype="application/pdf",
                as_attachment=True,
                download_name=f"Invoice-{invoice_data.get('orderId')}.pdf"
            )

    except Exception as e:
        logger.exception("❌ Unexpected error")
        return jsonify({"error": f"Unexpected server error: {str(e)}"}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
