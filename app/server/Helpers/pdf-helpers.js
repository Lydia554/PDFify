// -----------------------------
// pdf-helpers.js
// -----------------------------
const fs = require("fs");
const path = require("path");
const os = require("os");
const { PDFDocument, PDFName, PDFString } = require("pdf-lib");

// -----------------------------
// Helper: Clean PDF buffer
// -----------------------------
function cleanPdfBuffer(buf) {
  const pdfStart = buf.indexOf(Buffer.from("%PDF-"));
  return pdfStart > 0 ? buf.slice(pdfStart) : buf;
}

// -----------------------------
// Embed XMP metadata into PDF
// -----------------------------
async function embedXmp(pdfDoc) {
  const xmp = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"
      pdfaid:part="3"
      pdfaid:conformance="B"/>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

  const metadataStream = pdfDoc.context.flateStream(Buffer.from(xmp, "utf8"), {
    Type: PDFName.of("Metadata"),
    Subtype: PDFName.of("XML"),
    Filter: PDFName.of("FlateDecode"),
  });

  const metadataRef = pdfDoc.context.register(metadataStream);
  pdfDoc.catalog.set(PDFName.of("Metadata"), metadataRef);
  pdfDoc.catalog.set(PDFName.of("MarkInfo"), pdfDoc.context.obj({ Marked: true }));

  return pdfDoc;
}

// -----------------------------
// Embed ZUGFeRD XML into PDF
// -----------------------------
function embedXmlIntoPdf(pdfDoc, xml) {
  if (!xml) return pdfDoc;

  const xmlBytes = Buffer.from(xml.trim(), "utf8");
  const xmlStream = pdfDoc.context.flateStream(xmlBytes, {
    Type: PDFName.of("EmbeddedFile"),
    Subtype: PDFName.of("text#2Fxml"),
  });
  const xmlRef = pdfDoc.context.register(xmlStream);

  const fileSpecDict = pdfDoc.context.obj({
    Type: PDFName.of("Filespec"),
    F: PDFString.of("ZUGFeRD-invoice.xml"),
    UF: PDFString.of("ZUGFeRD-invoice.xml"),
    AFRelationship: PDFName.of("Alternative"),
    EF: { F: xmlRef },
  });
  const fileSpecRef = pdfDoc.context.register(fileSpecDict);

  const afArray = pdfDoc.context.obj([fileSpecRef]);
  pdfDoc.catalog.set(PDFName.of("AF"), afArray);

  const namesDict = pdfDoc.context.obj({
    EmbeddedFiles: pdfDoc.context.obj({
      Names: [PDFString.of("ZUGFeRD-invoice.xml"), fileSpecRef],
    }),
  });
  pdfDoc.catalog.set(PDFName.of("Names"), namesDict);

  return pdfDoc;
}

// -----------------------------
// Generate Shopify ZUGFeRD XML
// -----------------------------
function generateShopifyXML(data) {
  const orderId = data.invoiceNumber || data.orderId || "UNKNOWN";
  const date = data.date || new Date().toISOString().split("T")[0];
  const items = Array.isArray(data.items) ? data.items : [];
  const currency = data.currency || "EUR";
  const buyerName = data.customerName || "Valued Customer";
  const sellerName = data.companyName || "YOUR COMPANY GMBH";
  const iban = data.iban || "DE89370400440532013000";
  const bic = data.bic || "COBADEFFXXX";

  let totalAmount = 0;
  let totalTax = 0;
  let totalNet = 0;

  items.forEach(i => {
    const qty = Number(i.quantity || 1);
    const unitPrice = Number(i.price || 0);
    const lineTotal = Number(i.total || qty * unitPrice);
    const tax = Number(i.tax || 0);
    const net = lineTotal - tax;
    totalAmount += lineTotal;
    totalTax += tax;
    totalNet += net;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:ferd:CrossIndustryDocument:invoice:2p1"
                          xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:12"
                          xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:15"
                          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                          xsi:schemaLocation="urn:ferd:CrossIndustryDocument:invoice:2p1 FacturX_basic_1p0p1.xsd">
  <rsm:ExchangedDocument>
    <ram:ID>${orderId}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IncludedNote>
      <ram:Content>PROFILE: BASIC</ram:Content>
    </ram:IncludedNote>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${date.replace(/-/g, "")}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>

  <rsm:ApplicableHeaderTradeAgreement>
    <ram:SellerTradeParty>
      <ram:Name>${sellerName}</ram:Name>
      <ram:SpecifiedTaxRegistration>
        <ram:ID schemeID="VAT">DE123456789</ram:ID>
      </ram:SpecifiedTaxRegistration>
    </ram:SellerTradeParty>
    <ram:BuyerTradeParty>
      <ram:Name>${buyerName}</ram:Name>
    </ram:BuyerTradeParty>
  </rsm:ApplicableHeaderTradeAgreement>

  <rsm:ApplicableHeaderTradeDelivery>
    <ram:ActualDeliverySupplyChainEvent>
      <ram:OccurrenceDateTime>
        <udt:DateTimeString format="102">${date.replace(/-/g, "")}</udt:DateTimeString>
      </ram:OccurrenceDateTime>
    </ram:ActualDeliverySupplyChainEvent>
  </rsm:ApplicableHeaderTradeDelivery>

  <rsm:ApplicableHeaderTradeSettlement>
    <ram:PaymentReference>${orderId}</ram:PaymentReference>
    <ram:InvoiceCurrencyCode>${currency}</ram:InvoiceCurrencyCode>
    <ram:InvoiceTotalAmount>${totalAmount.toFixed(2)}</ram:InvoiceTotalAmount>
    <ram:TaxTotalAmount>${totalTax.toFixed(2)}</ram:TaxTotalAmount>
    <ram:LineTotalAmount>${totalNet.toFixed(2)}</ram:LineTotalAmount>
    <ram:SpecifiedTradeSettlementPaymentMeans>
      <ram:TypeCode>31</ram:TypeCode>
      <ram:PayeeFinancialAccount>
        <ram:IBANID>${iban}</ram:IBANID>
        <ram:BICID>${bic}</ram:BICID>
      </ram:PayeeFinancialAccount>
    </ram:SpecifiedTradeSettlementPaymentMeans>
  </rsm:ApplicableHeaderTradeSettlement>

  <rsm:SupplyChainTradeTransaction>
    ${items.map((item, i) => {
      const qty = Number(item.quantity || 1);
      const unitPrice = Number(item.price || 0);
      const lineTotal = Number(item.total || qty * unitPrice);
      const tax = Number(item.tax || 0);
      const net = lineTotal - tax;

      return `
      <ram:IncludedSupplyChainTradeLineItem>
        <ram:AssociatedDocumentLineDocument>
          <ram:LineID>${i + 1}</ram:LineID>
        </ram:AssociatedDocumentLineDocument>
        <ram:SpecifiedTradeProduct>
          <ram:Name>${item.name || item.description || ""}</ram:Name>
        </ram:SpecifiedTradeProduct>
        <ram:SpecifiedLineTradeAgreement>
          <ram:GrossPriceProductTradePrice>
            <ram:ChargeAmount>${unitPrice.toFixed(2)}</ram:ChargeAmount>
            <ram:BasisQuantity unitCode="C62">${qty}</ram:BasisQuantity>
          </ram:GrossPriceProductTradePrice>
        </ram:SpecifiedLineTradeAgreement>
        <ram:SpecifiedLineTradeDelivery>
          <ram:BilledQuantity unitCode="C62">${qty}</ram:BilledQuantity>
        </ram:SpecifiedLineTradeDelivery>
        <ram:SpecifiedLineTradeSettlement>
          <ram:ApplicableTradeTax>
            <ram:CalculatedAmount>${tax.toFixed(2)}</ram:CalculatedAmount>
            <ram:TypeCode>VAT</ram:TypeCode>
            <ram:RateApplicablePercent>${item.taxRate ?? 21}</ram:RateApplicablePercent>
          </ram:ApplicableTradeTax>
          <ram:TradeSettlementLineAmount>${lineTotal.toFixed(2)}</ram:TradeSettlementLineAmount>
          <ram:NetLineAmount>${net.toFixed(2)}</ram:NetLineAmount>
        </ram:SpecifiedLineTradeSettlement>
      </ram:IncludedSupplyChainTradeLineItem>`;
    }).join("")}
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}

// -----------------------------
// Finalize PDF with embedded XML
// -----------------------------
async function finalizePdfWithXml(originalPdfBuffer, zugferdXml) {
  const cleanBuffer = cleanPdfBuffer(originalPdfBuffer);
  const pdfDoc = await PDFDocument.load(cleanBuffer);

  await embedXmp(pdfDoc);
  embedXmlIntoPdf(pdfDoc, zugferdXml);

  const finalBuffer = await pdfDoc.save({ useObjectStreams: false });
  fs.writeFileSync(path.join(os.tmpdir(), "final_with_xml.pdf"), finalBuffer);

  console.log("✅ PDF finalized with embedded XML (no Ghostscript)");
  return finalBuffer;
}

// -----------------------------
// Exports
// -----------------------------
module.exports = {
  generateShopifyXML,
  embedXmp,
  embedXmlIntoPdf,
  finalizePdfWithXml
};
