from flask import Flask, request, jsonify
from facturx import generate_facturx_from_file

app = Flask(__name__)

@app.route("/process", methods=["POST"])
def process_invoice():
    data = request.json

    # Expect input PDF and XML paths from JSON payload
    pdf_path = data.get("pdf_path")    # the original PDF
    xml_path = data.get("xml_path")    # the invoice XML
    output_pdf = data.get("output_pdf", "output_facturx.pdf")  # optional output name

    if not pdf_path or not xml_path:
        return jsonify({"error": "Missing pdf_path or xml_path in request"}), 400

    try:
        # Generate ZUGFeRD / Factur-X compliant PDF
        generate_facturx_from_file(pdf_path, xml_path, output_pdf)
        return jsonify({
            "message": "ZUGFeRD-compliant PDF generated successfully",
            "output": output_pdf
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
