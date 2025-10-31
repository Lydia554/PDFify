from flask import Flask, request, send_file
from io import BytesIO
from facturx import generate_facturx_from_file
import json

app = Flask(__name__)

@app.route("/generate-zugferd", methods=["POST"])
def generate_zugferd():
    try:
        pdf_file = request.files.get("pdfFile")
        invoice_data_json = request.form.get("invoiceData")
        invoice_data = json.loads(invoice_data_json)

        pdf_bytes = pdf_file.read()
        pdf_buffer = BytesIO(pdf_bytes)
        final_pdf_io = BytesIO()

        # ZUGFeRD 2.3 Comfort
        generate_facturx_from_file(
            pdf_buffer,
            invoice_data,
            output_pdf=final_pdf_io,
            facturx_level="EN16931",  # ZUGFeRD 2.3
            profile="comfort",        # Comfort profile
            include_attachment=False
        )

        final_pdf_io.seek(0)
        return send_file(
            final_pdf_io,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=f"Invoice-ZUGFeRD-2.3-{invoice_data['orderId']}.pdf"
        )
    except Exception as e:
        import traceback
        print("❌ ZUGFeRD generation failed:", e)
        traceback.print_exc()
        return (
            f"<h1>500 Internal Server Error</h1>"
            f"<p>ZUGFeRD generation failed:</p>"
            f"<pre>{str(e)}</pre>",
            500,
        )

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
