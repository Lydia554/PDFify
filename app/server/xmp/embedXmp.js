const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const { generateInvoiceHTML_PdfaSafe } = require("./htmlInvoice"); // your updated HTML
const fs = require("fs");
const path = require("path");

/**
 * Embed PDF/A XMP metadata
 */
async function embedXmp(pdfDoc) {
  const xmpTemplate = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
  pdfDoc.setMetadata(xmpTemplate);
}

/**
 * Generate ZUGFeRD 2.1 XML (EN16931)
 */
function generateZugferdXML(invoiceData) {
  const itemsXML = (invoiceData.items || []).map((item, idx) => `
    <rsm:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>${item.position || idx + 1}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:Name>${item.name}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount>${item.price.toFixed(2)}</ram:ChargeAmount>
          <ram:BasisQuantity unitCode="C62">${item.quantity}</ram:BasisQuantity>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="C62">${item.quantity}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:CalculatedAmount>${item.tax.toFixed(2)}</ram:CalculatedAmount>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${item.total.toFixed(2)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </rsm:IncludedSupplyChainTradeLineItem>`).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryDocument xmlns:rsm="urn:ferd:CrossIndustryDocument:invoice:1p0"
    xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <rsm:ExchangedDocument>
    <ram:ID>${invoiceData.orderId}</ram:ID>
    <ram:IssueDateTime><udt:DateTimeString format="102">${invoiceData.date}</udt:DateTimeString></ram:IssueDateTime>
    <ram:TypeCode>380</ram:TypeCode>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    ${itemsXML}
    <ram:ApplicableHeaderTradeSettlement>
      <ram:PaymentReference>${invoiceData.orderId}</ram:PaymentReference>
      <ram:InvoiceCurrencyCode>${invoiceData.currency || "EUR"}</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>58</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount>
          <ram:IBANID>${invoiceData.iban}</ram:IBANID>
          <ram:BICID>${invoiceData.bic}</ram:BICID>
        </ram:PayeePartyCreditorFinancialAccount>
      </ram:SpecifiedTradeSettlementPaymentMeans>
      <ram:InvoicePeriod>
        <ram:StartDateTime>${invoiceData.date}</ram:StartDateTime>
      </ram:InvoicePeriod>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${invoiceData.subtotal.toFixed(2)}</ram:LineTotalAmount>
        <ram:TaxTotalAmount>${invoiceData.tax.toFixed(2)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${invoiceData.total.toFixed(2)}</ram:GrandTotalAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
  <zf:ConformanceLevel>EN16931</zf:ConformanceLevel>
  <zf:Version>2.1</zf:Version>
</rsm:CrossIndustryDocument>`;
}

/**
 * Generate full PDF/A-3b + ZUGFeRD invoice
 */
async function createInvoicePDF(invoiceData) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);

  // Embed font
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Add OutputIntent (ICC profile) for PDF/A
  const iccProfile = fs.readFileSync(path.resolve(__dirname, './sRGB_v4_ICC_preference.icc'));
  pdfDoc.catalog.set('OutputIntents', [
    pdfDoc.context.obj({
      Type: 'OutputIntent',
      S: 'GTS_PDFA1',
      OutputConditionIdentifier: 'sRGB IEC61966-2.1',
      Info: 'sRGB IEC61966-2.1',
      DestOutputProfile: pdfDoc.context.stream(iccProfile)
    })
  ]);

  // Render HTML as text (simplest)
  const html = await generateInvoiceHTML_PdfaSafe(invoiceData);
  page.drawText("Invoice (see attached ZUGFeRD XML)", { x: 50, y: 800, size: 12, font });

  // Embed XMP metadata for PDF/A
  await embedXmp(pdfDoc);

  // Embed ZUGFeRD XML as attachment
  const xmlContent = generateZugferdXML(invoiceData);
  const xmlStream = pdfDoc.context.flateStream(Buffer.from(xmlContent, "utf8"), {
    Type: pdfDoc.context.obj("EmbeddedFile"),
    Subtype: pdfDoc.context.obj("text/xml")
  });
  const xmlRef = pdfDoc.context.register(xmlStream);

  const efDict = pdfDoc.context.obj({ F: xmlRef });
  const filespec = pdfDoc.context.obj({
    Type: pdfDoc.context.obj("Filespec"),
    F: pdfDoc.context.obj("ZUGFeRD-invoice.xml"),
    EF: efDict,
    Desc: "ZUGFeRD XML"
  });
  const filespecRef = pdfDoc.context.register(filespec);

  pdfDoc.catalog.set(pdfDoc.context.obj("Names"), pdfDoc.context.obj({
    EmbeddedFiles: pdfDoc.context.obj({
      Names: [pdfDoc.context.obj("ZUGFeRD-invoice.xml"), filespecRef]
    })
  }));

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

module.exports = { createInvoicePDF, generateZugferdXML };
