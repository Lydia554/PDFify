from flask import Flask, request, send_file
from io import BytesIO
from facturx import generate_facturx_from_file
import json

app = Flask(__name__)

@app.route("/generate-zugferd", methods=["POST"])
def generate_zugferd():
    try:
        # 1️⃣ Get uploaded PDF
        pdf_file = request.files.get("pdfFile")
        if pdf_file is None:
            return {"error": "Missing pdfFile"}, 400

        # 2️⃣ Get invoice data
        invoice_data_json = request.form.get("invoiceData")
        if not invoice_data_json:
            return {"error": "Missing invoiceData"}, 400
        invoice_data = json.loads(invoice_data_json)

        # 3️⃣ Wrap PDF in BytesIO
        input_pdf_io = BytesIO(pdf_file.read())

        # 4️⃣ Generate ZUGFeRD PDF
        # This returns either a BytesIO or raw bytes
        output = generate_facturx_from_file(
            input_pdf_io,
            invoice_data,
            facturx_level="EN16931",
            comfort=True,
            include_attachment=False
        )

        # 5️⃣ Ensure we have a BytesIO
        if isinstance(output, BytesIO):
            output_pdf_io = output
        else:
            output_pdf_io = BytesIO(output)

        output_pdf_io.seek(0)

        # 6️⃣ Send back PDF
        return send_file(
            output_pdf_io,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=f"Invoice-ZUGFeRD-{invoice_data.get('orderId', 'unknown')}.pdf"
        )

    except Exception as e:
        print("❌ Python ZUGFeRD service error:", e)
        return {"error": "ZUGFeRD generation failed", "details": str(e)}, 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
