from flask import Flask, request, jsonify
import zugferd 

app = Flask(__name__)

@app.route("/process", methods=["POST"])
def process_invoice():
    data = request.json
    # Example: generate a ZUGFeRD XML or PDF
    result = zugferd.generate_invoice(data)  
    return jsonify({"result": result})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
