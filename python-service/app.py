from flask import Flask, request, send_file
from io import BytesIO
from facturx import generate_facturx_from_file
from lxml import etree
import json

app = Flask(__name__)
# -----------------------------
# Convert Shopify invoice JSON → EN16931 XML (ZUGFeRD 2.3)
# -----------------------------
def shopify_invoice_to_en16931(invoice):
    nsmap = {
        None: "urn:ferd:CrossIndustryInvoice:invoice:1p0",  # default namespace for root
        "ram": "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
        "qdt": "urn:un:unece:uncefact:data:standard:QualifiedDataType:100",
        "udt": "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",
    }

    # Root element in default namespace
    root = etree.Element("CrossIndustryInvoice", nsmap=nsmap)

    # ExchangedDocument (Invoice header)
    exchanged_document = etree.SubElement(root, "ExchangedDocument")
    etree.SubElement(exchanged_document, "ID").text = str(invoice.get("orderId", "UNKNOWN"))
    etree.SubElement(exchanged_document, "IssueDateTime").text = invoice.get("date", "")

    # Seller / Company
    seller = etree.SubElement(root, "SupplyChainTradeParty")
    etree.SubElement(seller, "Name").text = invoice.get("companyName", "YOUR COMPANY GMBH")

    # Buyer
    buyer = etree.SubElement(root, "BuyerTradeParty")
    etree.SubElement(buyer, "Name").text = invoice.get("customerName", "Valued Customer")

    # Trade transaction / line items
    trade_transaction = etree.SubElement(root, "SupplyChainTradeTransaction")
    for idx, item in enumerate(invoice.get("items", []), start=1):
        line_item = etree.SubElement(trade_transaction, "IncludedSupplyChainTradeLineItem")
        etree.SubElement(line_item, "LineID").text = str(item.get("position", idx))

        product = etree.SubElement(line_item, "SpecifiedTradeProduct")
        etree.SubElement(product, "Name").text = str(item.get("name", ""))

        trade_agreement = etree.SubElement(line_item, "SpecifiedLineTradeAgreement")
        price_elem = etree.SubElement(trade_agreement, "NetPriceProductTradePrice")
        etree.SubElement(price_elem, "ChargeAmount").text = str(item.get("price", 0))

        trade_delivery = etree.SubElement(line_item, "SpecifiedLineTradeDelivery")
        etree.SubElement(trade_delivery, "BilledQuantity").text = str(item.get("quantity", 1))

        trade_settlement = etree.SubElement(line_item, "SpecifiedLineTradeSettlement")
        tax_elem = etree.SubElement(trade_settlement, "ApplicableTradeTax")
        etree.SubElement(tax_elem, "CalculatedAmount").text = str(item.get("tax", 0))
        etree.SubElement(tax_elem, "RateApplicablePercent").text = str(item.get("taxRate", 0))

    return root


# -----------------------------
# Flask route
# -----------------------------
@app.route("/generate-zugferd", methods=["POST"])
def generate_zugferd():
    try:
        pdf_file = request.files.get("pdfFile")
        if not pdf_file:
            return {"error": "Missing pdfFile"}, 400

        invoice_data_json = request.form.get("invoiceData")
        if not invoice_data_json:
            return {"error": "Missing invoiceData"}, 400

        invoice_data = json.loads(invoice_data_json)
        input_pdf_io = BytesIO(pdf_file.read())

        # Convert JSON → XML for Factur-X / ZUGFeRD
        xml_root = shopify_invoice_to_en16931(invoice_data)

        # Generate PDF/A-3b ZUGFeRD PDF (EN16931 full structured XML)
        output_pdf_bytes = generate_facturx_from_file(
            input_pdf_io,
            xml_root,
            facturx_level="EN16931"  # ZUGFeRD 2.3
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
