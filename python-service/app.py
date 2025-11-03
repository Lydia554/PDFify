from flask import Flask, request, send_file
from io import BytesIO
from facturx import generate_facturx_from_file
from lxml import etree
import json

app = Flask(__name__)

# -----------------------------
# Convert Shopify invoice JSON → EN16931 XML
# -----------------------------
def shopify_invoice_to_en16931(invoice):
    nsmap = {
        "rsm": "urn:ferd:CrossIndustryInvoice:invoice:1p0",
        "ram": "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
    }

    root = etree.Element("rsm:CrossIndustryInvoice", nsmap=nsmap)

    # Invoice header
    exchanged_document = etree.SubElement(root, "rsm:ExchangedDocument")
    etree.SubElement(exchanged_document, "ram:ID").text = str(invoice.get("orderId"))
    etree.SubElement(exchanged_document, "ram:IssueDateTime").text = invoice.get("date", "")

    # Seller / Company
    seller = etree.SubElement(root, "ram:SupplyChainTradeParty")
    etree.SubElement(seller, "ram:Name").text = invoice.get("companyName", "YOUR COMPANY GMBH")

    # Buyer
    buyer = etree.SubElement(root, "ram:BuyerTradeParty")
    etree.SubElement(buyer, "ram:Name").text = invoice.get("customerName", "Valued Customer")

    # Items
    trade_transaction = etree.SubElement(root, "rsm:SupplyChainTradeTransaction")
    for item in invoice.get("items", []):
        line_item = etree.SubElement(trade_transaction, "ram:IncludedSupplyChainTradeLineItem")
        etree.SubElement(line_item, "ram:LineID").text = str(item.get("position", 1))
        product = etree.SubElement(line_item, "ram:SpecifiedTradeProduct")
        etree.SubElement(product, "ram:Name").text = item.get("name", "")
        trade_agreement = etree.SubElement(line_item, "ram:SpecifiedLineTradeAgreement")
        price_elem = etree.SubElement(trade_agreement, "ram:NetPriceProductTradePrice")
        etree.SubElement(price_elem, "ram:ChargeAmount").text = str(item.get("price", 0))
        trade_delivery = etree.SubElement(line_item, "ram:SpecifiedLineTradeDelivery")
        etree.SubElement(trade_delivery, "ram:BilledQuantity").text = str(item.get("quantity", 1))
        trade_settlement = etree.SubElement(line_item, "ram:SpecifiedLineTradeSettlement")
        tax_elem = etree.SubElement(trade_settlement, "ram:ApplicableTradeTax")
        etree.SubElement(tax_elem, "ram:CalculatedAmount").text = str(item.get("tax", 0))
        etree.SubElement(tax_elem, "ram:RateApplicablePercent").text = str(item.get("taxRate", 0))

    return root

# -----------------------------
# Flask route
# -----------------------------
@app.route("/generate-zugferd", methods=["POST"])
def generate_zugferd():
    try:
        pdf_file = request.files.get("pdfFile")
        if pdf_file is None:
            return {"error": "Missing pdfFile"}, 400

        invoice_data_json = request.form.get("invoiceData")
        if not invoice_data_json:
            return {"error": "Missing invoiceData"}, 400

        invoice_data = json.loads(invoice_data_json)
        input_pdf_io = BytesIO(pdf_file.read())

        # Convert JSON → XML for Factur-X / ZUGFeRD
        xml_root = shopify_invoice_to_en16931(invoice_data)

        # Generate PDF/A-3b ZUGFeRD PDF
        output_pdf_bytes = generate_facturx_from_file(
            input_pdf_io,
            xml_root,
            facturx_level="EN16931"  # Full structured XML
        )

        output_pdf_io = BytesIO(output_pdf_bytes)
        output_pdf_io.seek(0)

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
