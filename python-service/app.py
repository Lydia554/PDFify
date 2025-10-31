from flask import Flask, request, send_file
from io import BytesIO
from facturx import generate_facturx_from_file
import json

app = Flask(__name__)

@app.route("/generate-zugferd", methods=["POST"])
def generate_zugferd():
    try:
        # --- Get uploaded PDF and invoice data ---
        pdf_file = request.files.get("pdfFile")
        if pdf_file is None:
            return {"error": "Missing pdfFile"}, 400

        invoice_data_json = request.form.get("invoiceData")
        if not invoice_data_json:
            return {"error": "Missing invoiceData"}, 400

        invoice_data = json.loads(invoice_data_json)

        # --- Load PDF into BytesIO ---
        pdf_bytes = pdf_file.read()
        pdf_buffer = BytesIO(pdf_bytes)

        # --- Generate ZUGFeRD 2.3 Comfort in-place ---
        generate_facturx_from_file(
            pdf_buffer,
            invoice_data,
            facturx_level="EN16931",  # ZUGFeRD 2.3
            profile="comfort"
        )

        # --- Return PDF to client ---
        pdf_buffer.seek(0)
        return send_file(
            pdf_buffer,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=f"Invoice-ZUGFeRD-2.3-{invoice_data.get('orderId', 'unknown')}.pdf"
        )

    except Exception as e:
        # Catch-all error logging
        print("❌ Python ZUGFeRD service error:", e)
        return {"error": "ZUGFeRD generation failed", "details": str(e)}, 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
