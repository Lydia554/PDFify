from flask import Flask, request, send_file, jsonify
from facturx import generate_facturx_from_file
from io import BytesIO
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
import os
import tempfile

app = Flask(__name__)

# Optional ICC profile path (can be omitted if not needed)
ICC_PROFILE_PATH = os.getenv("ICC_PROFILE_PATH")

def create_pdf_bytes(invoice_data):
    pdf_buffer = BytesIO()
    c = canvas.Canvas(pdf_buffer, pagesize=A4, bottomup=1)

    # Embed ICC profile only if it exists
    if ICC_PROFILE_PATH and os.path.exists(ICC_PROFILE_PATH):
        try:
            c.setICCProfile(ICC_PROFILE_PATH)
        except Exception as e:
            print(f"⚠️ Warning: Could not set ICC profile: {e}")

    # Simple invoice layout
    c.drawString(50, 800, f"Invoice ID: {invoice_data.get('orderId')}")
    c.drawString(50, 780, f"Customer: {invoice_data.get('customerName')}")
    c.drawString(50, 760, f"Total: {invoice_data.get('total')}")

    c.showPage()
    c.save()
    pdf_buffer.seek(0)
    return pdf_buffer

def create_zugferd_xml_bytes(invoice_data):
    xml_str = f"""<?xml version="1.0" encoding="UTF-8"?>
<Invoice>
  <ID>{invoice_data.get('orderId')}</ID>
  <Customer>{invoice_data.get('customerName')}</Customer>
  <Total>{invoice_data.get('total')}</Total>
</Invoice>
"""
    return BytesIO(xml_str.encode('utf-8'))

@app.route("/generate-zugferd", methods=["POST"])
def generate_zugferd():
    data = request.json.get("invoiceData")
    if not data:
        return jsonify({"error": "Missing invoiceData in request"}), 400

    pdf_bytes = create_pdf_bytes(data)
    xml_bytes = create_zugferd_xml_bytes(data)

    with tempfile.NamedTemporaryFile(suffix=".pdf") as pdf_file, \
         tempfile.NamedTemporaryFile(suffix=".xml") as xml_file, \
         tempfile.NamedTemporaryFile(suffix=".pdf") as output_file:

        pdf_file.write(pdf_bytes.read())
        pdf_file.flush()

        xml_file.write(xml_bytes.read())
        xml_file.flush()

        # Embed ZUGFeRD XML into PDF
        generate_facturx_from_file(pdf_file.name, xml_file.name, output_file.name)

        output_file.seek(0)
        return send_file(
            output_file,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=f"Invoice-{data.get('orderId')}.pdf"
        )

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
