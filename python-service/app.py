from flask import Flask, request, send_file, jsonify
from facturx import generate_facturx_from_file
import tempfile, os
import base64

app = Flask(__name__)

ICC_PROFILE_PATH = os.getenv("ICC_PROFILE_PATH")

@app.route("/generate-zugferd", methods=["POST"])
def generate_zugferd():
    # Force JSON parsing and log incoming data for debugging
    try:
        data = request.get_json(force=True)
    except Exception as e:
        return jsonify({"error": f"Failed to parse JSON: {str(e)}"}), 400

    print("Received keys:", list(data.keys()) if data else None)
    
    if not data or "pdf_base64" not in data or "invoiceData" not in data:
        return jsonify({"error": "Missing required fields (pdf_base64, invoiceData)"}), 400

    pdf_bytes = base64.b64decode(data["pdf_base64"])
    invoice_data = data["invoiceData"]

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
            return jsonify({"error": f"Failed to generate ZUGFeRD PDF: {str(e)}"}), 500

        pdf_out.seek(0)
        return send_file(
            pdf_out,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=f"Invoice-{invoice_data.get('orderId')}.pdf"
        )

if __name__ == "__main__":
    # Increase max payload size if needed (default is 16MB in Flask)
    app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50 MB
    app.run(host="0.0.0.0", port=5000)
