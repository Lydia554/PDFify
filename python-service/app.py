from flask import Flask, request, send_file
from io import BytesIO
from facturx import generate_facturx_from_file
from lxml import etree
import json

app = Flask(__name__)

def shopify_invoice_to_en16931(invoice):
    nsmap = {
        "rsm": "urn:ferd:CrossIndustryInvoice:invoice:1p0",
        "ram": "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
        "qdt": "urn:un:unece:uncefact:data:standard:QualifiedDataType:100",
        "udt": "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",
    }

    root = etree.Element("{urn:ferd:CrossIndustryInvoice:invoice:1p0}CrossIndustryInvoice", nsmap=nsmap)

    exchanged_document = etree.SubElement(root, "{urn:ferd:CrossIndustryInvoice:invoice:1p0}ExchangedDocument")
    etree.SubElement(exchanged_document, "{%s}ID" % nsmap["ram"]).text = str(invoice.get("orderId", "UNKNOWN"))
    etree.SubElement(exchanged_document, "{%s}TypeCode" % nsmap["ram"]).text = "380"
    etree.SubElement(exchanged_document, "{%s}IssueDateTime" % nsmap["ram"]).text = invoice.get("date", "")

    doc_context = etree.SubElement(root, "{urn:ferd:CrossIndustryInvoice:invoice:1p0}ExchangedDocumentContext")
    business_process = etree.SubElement(doc_context, "{%s}GuidelineSpecifiedDocumentContextParameter" % nsmap["ram"])
    etree.SubElement(business_process, "{%s}ID" % nsmap["ram"]).text = "urn:ferd:CrossIndustryDocument:invoice:1p0:basic"

    trade_transaction = etree.SubElement(root, "{urn:ferd:CrossIndustryInvoice:invoice:1p0}SupplyChainTradeTransaction")

    seller = etree.SubElement(trade_transaction, "{%s}SellerTradeParty" % nsmap["ram"])
    etree.SubElement(seller, "{%s}Name" % nsmap["ram"]).text = invoice.get("companyName", "YOUR COMPANY GMBH")

    buyer = etree.SubElement(trade_transaction, "{%s}BuyerTradeParty" % nsmap["ram"])
    etree.SubElement(buyer, "{%s}Name" % nsmap["ram"]).text = invoice.get("customerName", "Valued Customer")

    for idx, item in enumerate(invoice.get("items", []), start=1):
        line_item = etree.SubElement(trade_transaction, "{%s}IncludedSupplyChainTradeLineItem" % nsmap["ram"])
        etree.SubElement(line_item, "{%s}LineID" % nsmap["ram"]).text = str(item.get("position", idx))

        product = etree.SubElement(line_item, "{%s}SpecifiedTradeProduct" % nsmap["ram"])
        etree.SubElement(product, "{%s}Name" % nsmap["ram"]).text = str(item.get("name", ""))

        trade_agreement = etree.SubElement(line_item, "{%s}SpecifiedLineTradeAgreement" % nsmap["ram"])
        price_elem = etree.SubElement(trade_agreement, "{%s}NetPriceProductTradePrice" % nsmap["ram"])
        etree.SubElement(price_elem, "{%s}ChargeAmount" % nsmap["ram"]).text = str(item.get("price", 0))

        trade_delivery = etree.SubElement(line_item, "{%s}SpecifiedLineTradeDelivery" % nsmap["ram"])
        etree.SubElement(trade_delivery, "{%s}BilledQuantity" % nsmap["ram"]).text = str(item.get("quantity", 1))

        trade_settlement = etree.SubElement(line_item, "{%s}SpecifiedLineTradeSettlement" % nsmap["ram"])
        tax_elem = etree.SubElement(trade_settlement, "{%s}ApplicableTradeTax" % nsmap["ram"])
        etree.SubElement(tax_elem, "{%s}CalculatedAmount" % nsmap["ram"]).text = str(item.get("tax", 0))
        etree.SubElement(tax_elem, "{%s}TypeCode" % nsmap["ram"]).text = "VAT"
        etree.SubElement(tax_elem, "{%s}RateApplicablePercent" % nsmap["ram"]).text = str(item.get("taxRate", 0))

    return root


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

        xml_root = shopify_invoice_to_en16931(invoice_data)

        output_pdf_bytes = generate_facturx_from_file(
            input_pdf_io,
            xml_root,
            facturx_level="EN16931"
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
