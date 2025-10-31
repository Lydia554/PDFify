from flask import Flask, request, send_file, jsonify
from facturx import generate_facturx_from_file
import tempfile, os, json

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50 MB max upload

ICC_PROFILE_PATH = os.getenv("ICC_PROFILE_PATH")

@app.route("/generate-zugferd", methods=["POST"])
def generate_zugferd():
    print("=== Incoming Request ===")
    print("Content-Type:", request.content_type)
    print("Form keys:", list(request.form.keys()))
    print("Files keys:", list(request.files.keys()))

    if 'pdfFile' not in request.files:
        return jsonify({"error": "Missing 'pdfFile' in request"}), 400
    if 'invoiceData' not in request.form:
        return jsonify({"error": "Missing 'invoiceData' in request"}), 400

    pdf_file = request.files['pdfFile']
    invoice_data_raw = request.form['invoiceData']

    try:
        invoice_data = json.loads(invoice_data_raw)
    except Exception as e:
        return jsonify({"error": f"invoiceData JSON invalid: {str(e)}"}), 400

    print("Invoice data keys:", list(invoice_data.keys()))

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
                print("❌ FacturX generation failed:", e)
                return jsonify({"error": f"Failed to generate ZUGFeRD PDF: {str(e)}"}), 500

            pdf_out.seek(0)
            print("✅ ZUGFeRD PDF generated successfully")
            return send_file(
                pdf_out,
                mimetype="application/pdf",
                as_attachment=True,
                download_name=f"Invoice-{invoice_data.get('orderId')}.pdf"
            )

    except Exception as e:
        print("❌ Unexpected error:", e)
        return jsonify({"error": f"Unexpected server error: {str(e)}"}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
