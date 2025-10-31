from flask import Flask, request, send_file, jsonify
from facturx import generate_facturx_from_file
import tempfile, os, json, logging

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50 MB max upload

# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ZUGFeRD")

ICC_PROFILE_PATH = os.getenv("ICC_PROFILE_PATH")

@app.route("/generate-zugferd", methods=["POST"])
def generate_zugferd():
    logger.info("=== Incoming Request ===")
    logger.info("Content-Type: %s", request.content_type)
    logger.info("Form keys: %s", list(request.form.keys()))
    logger.info("Files keys: %s", list(request.files.keys()))

    if 'pdfFile' not in request.files:
        logger.error("Missing 'pdfFile' in request")
        return jsonify({"error": "Missing 'pdfFile' in request"}), 400
    if 'invoiceData' not in request.form:
        logger.error("Missing 'invoiceData' in request")
        return jsonify({"error": "Missing 'invoiceData' in request"}), 400

    pdf_file = request.files['pdfFile']
    invoice_data_raw = request.form['invoiceData']

    logger.info("Received PDF file: name=%s, size=%d bytes",
                pdf_file.filename, len(pdf_file.read()))
    pdf_file.seek(0)  # Reset pointer after reading for logging

    try:
        invoice_data = json.loads(invoice_data_raw)
    except Exception as e:
        logger.error("Invalid invoiceData JSON: %s", e)
        return jsonify({"error": f"invoiceData JSON invalid: {str(e)}"}), 400

    logger.info("Invoice data keys: %s", list(invoice_data.keys()))

    try:
        pdf_bytes = pdf_file.read()

        # Create XML dynamically
        xml_str = f"""<?xml version="1.0" encoding="UTF-8"?>
<Invoice>
  <ID>{invoice_data.get('orderId')}</ID>
  <Customer>{invoice_data.get('customerName')}</Customer>
  <Total>{invoice_data.get('total')}</Total>
</Invoice>"""
        xml_bytes = xml_str.encode("utf-8")

        with tempfile.NamedTemporaryFile(suffix=".pdf") as pdf_in, \
             tempfile.NamedTemporaryFile(suffix=".xml") as xml_in, \
             tempfile.NamedTemporaryFile(suffix=".pdf") as pdf_out:

            pdf_in.write(pdf_bytes)
            pdf_in.flush()
            xml_in.write(xml_bytes)
            xml_in.flush()

            try:
                generate_facturx_from_file(pdf_in.name, xml_in.name, pdf_out.name)
            except Exception as e:
                logger.exception("❌ FacturX generation failed")
                return jsonify({"error": f"Failed to generate ZUGFeRD PDF: {str(e)}"}), 500

            pdf_out.seek(0)
            logger.info("✅ ZUGFeRD PDF generated successfully")
            return send_file(
                pdf_out,
                mimetype="application/pdf",
                as_attachment=True,
                download_name=f"Invoice-{invoice_data.get('orderId')}.pdf"
            )

    except Exception as e:
        logger.exception("❌ Unexpected error in /generate-zugferd")
        return jsonify({"error": f"Unexpected server error: {str(e)}"}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
