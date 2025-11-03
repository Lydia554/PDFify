from flask import Flask, request, send_file, jsonify
from io import BytesIO
from facturx import generate_facturx_from_file
import json
import logging

app = Flask(__name__)

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

@app.route("/generate-zugferd", methods=["POST"])
def generate_zugferd():
    try:
        pdf_file = request.files.get("pdfFile")
        if pdf_file is None:
            return jsonify({"error": "Missing pdfFile"}), 400

        invoice_data_json = request.form.get("invoiceData")
        if not invoice_data_json:
            return jsonify({"error": "Missing invoiceData"}), 400

        invoice_data = json.loads(invoice_data_json)

        # Read the input PDF
        input_pdf_io = BytesIO(pdf_file.read())
        output_pdf_io = BytesIO()

        # Generate PDF/A-3b + ZUGFeRD 2.3
        logging.info(f"Generating PDF/A-3b + ZUGFeRD for order: {invoice_data.get('orderId', 'unknown')}")
        generate_facturx_from_file(
            input_pdf_io,
            invoice_data,
            output_pdf=output_pdf_io,
            facturx_level="EN16931",
            comfort=True,               # include Comfort profile
            include_attachment=False    # no attachment
        )

        output_pdf_io.seek(0)
        logging.info("✅ ZUGFeRD PDF generation successful")

        return send_file(
            output_pdf_io,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=f"Invoice-ZUGFeRD-2.3-{invoice_data.get('orderId', 'unknown')}.pdf"
        )

    except Exception as e:
        logging.error("❌ Python ZUGFeRD service error:", exc_info=e)
        return jsonify({"error": "ZUGFeRD generation failed", "details": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
