// pdf-helpers.js
const fs = require("fs");
const path = require("path");
const { PDFName } = require("pdf-lib");

// Embed ICC profile for PDF/A
async function embedIccProfile(pdfDoc) {
  const iccPath = path.resolve(__dirname, "../routes/sRGB_v4_ICC_preference.icc");
  if (!fs.existsSync(iccPath)) throw new Error("ICC profile not found at " + iccPath);
  const iccBytes = fs.readFileSync(iccPath);
  const iccStream = pdfDoc.context.flateStream(iccBytes);
  const iccRef = pdfDoc.context.register(iccStream);

  pdfDoc.catalog.set('OutputIntents', [
    pdfDoc.context.obj({
      Type: 'OutputIntent',
      S: 'GTS_PDFA1',
      OutputConditionIdentifier: 'sRGB IEC61966-2.1',
      Info: 'sRGB IEC61966-2.1',
      DestOutputProfile: iccRef
    })
  ]);
}

// Embed XMP metadata
async function embedXmp(pdfDoc, xmpFileName = "zugferd.xmp") {
  const xmpPath = path.resolve(__dirname, "xmp", xmpFileName);
  if (!fs.existsSync(xmpPath)) throw new Error("XMP file not found at " + xmpPath);
  const xmpTemplate = fs.readFileSync(xmpPath, "utf8");

  // Create a metadata stream
  const xmpStream = pdfDoc.context.flateStream(Buffer.from(xmpTemplate, "utf8"));
  const xmpRef = pdfDoc.context.register(xmpStream);

  // Add it to the catalog
  pdfDoc.catalog.set(PDFName.of("Metadata"), xmpRef);
}


// Embed ZUGFeRD XML into PDF
function embedXmlIntoPdf(pdfDoc, xmlContent, fileName = "zugferd-invoice.xml") {
  const xmlBuffer = Buffer.from(xmlContent, "utf8");
  const fileSpecDict = pdfDoc.context.obj({
    Type: "Filespec",
    F: fileName,
    UF: fileName,
    AFRelationship: "Data",
    Desc: "ZUGFeRD Invoice XML",
    EF: { F: pdfDoc.context.stream(xmlBuffer) }
  });
  const fileSpecRef = pdfDoc.context.register(fileSpecDict);
  pdfDoc.catalog.set(PDFName.of("AF"), pdfDoc.context.obj([fileSpecRef]));
  return fileSpecRef;
}

// ZUGFeRD XML generator (dynamic)
function generateZugferdXML(data) {
  const vatRate = data.vatRate ?? 21;
  const subtotal = (data.subtotal ?? 0).toFixed(2);
  const tax = (data.tax ?? 0).toFixed(2);
  const total = (data.total ?? 0).toFixed(2);

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:ferd:CrossIndustryDocument:invoice:2p1">
  <rsm:ExchangedDocument>
    <ram:ID>${data.orderId}</ram:ID>
    <ram:IssueDateTime>${data.date}</ram:IssueDateTime>
  </rsm:ExchangedDocument>

  <rsm:SupplyChainTradeTransaction>
    ${data.items.map((item, idx) => `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>${idx + 1}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:Name>${item.name}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:CalculatedAmount>${item.tax.toFixed(2)}</ram:CalculatedAmount>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>S</ram:CategoryCode>
          <ram:RateApplicablePercent>${vatRate}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:TradeSettlementLineAmount>${item.total.toFixed(2)}</ram:TradeSettlementLineAmount>
        <ram:NetLineAmount>${item.net.toFixed(2)}</ram:NetLineAmount>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>
    `).join("")}

    <ram:SpecifiedTradeSettlementHeader>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${tax}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:CategoryCode>S</ram:CategoryCode>
        <ram:RateApplicablePercent>${vatRate}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:LineTotalAmount>${subtotal}</ram:LineTotalAmount>
      <ram:GrandTotalAmount>${total}</ram:GrandTotalAmount>
    </ram:SpecifiedTradeSettlementHeader>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}

module.exports = { embedIccProfile, embedXmp, embedXmlIntoPdf, generateZugferdXML };
