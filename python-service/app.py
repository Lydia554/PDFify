from flask import Flask, request, send_file, jsonify
from facturx import generate_facturx_from_file
import tempfile, os, json

app = Flask(__name__)

ICC_PROFILE_PATH = os.getenv("ICC_PROFILE_PATH")

@app.route("/generate-zugferd", methods=["POST"])
def generate_zugferd():
    if 'pdfFile' not in request.files or 'invoiceData' not in request.form:
        return jsonify({"error": "Missing pdfFile or invoiceData"}), 400

    pdf_file = request.files['pdfFile']
    invoice_data = json.loads(request.form['invoiceData'])

    with tempfile.NamedTemporaryFile(suffix=".pdf") as pdf_in, \
         tempfile.NamedTemporaryFile(suffix=".xml") as xml_in, \
         tempfile.NamedTemporaryFile(suffix=".pdf") as pdf_out:

        pdf_file.save(pdf_in.name)

        # Create XML dynamically
        xml_str = f"""<?xml version="1.0" encoding="UTF-8"?>
<Invoice>
  <ID>{invoice_data.get('orderId')}</ID>
  <Customer>{invoice_data.get('customerName')}</Customer>
  <Total>{invoice_data.get('total')}</Total>
</Invoice>"""
        xml_in.write(xml_str.encode("utf-8"))
        xml_in.flush()

        try:
            generate_facturx_from_file(pdf_in.name, xml_in.name, pdf_out.name)
        except Exception as e:
            return jsonify({"error": f"Failed to generate ZUGFeRD PDF: {str(e)}"}), 500

        pdf_out.seek(0)
        return send_file(
            pdf_out,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=f"Invoice-{invoice_data.get('orderId')}.pdf"
        )

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
