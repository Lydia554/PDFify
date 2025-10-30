from flask import Flask, request, jsonify
from facturx import generate_facturx_from_file

app = Flask(__name__)

@app.route("/generate-zugferd", methods=["POST"])
def generate_zugferd():
    data = request.json

    
    pdf_path = data.get("pdf_path")
    xml_path = data.get("xml_path")
    output_pdf = data.get("output_pdf", "output_facturx.pdf")

    if not pdf_path or not xml_path:
        return jsonify({"error": "Missing pdf_path or xml_path"}), 400

    try:
        generate_facturx_from_file(pdf_path, xml_path, output_pdf)
        return jsonify({
            "message": "ZUGFeRD PDF generated",
            "output": output_pdf
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
