// pdf-helpers.js
const fs = require("fs");
const path = require("path");
const { PDFName } = require("pdf-lib");

// Embed ICC profile for PDF/A
async function embedIccProfile(pdfDoc) {
  const iccBytes = fs.readFileSync(path.resolve(__dirname, './sRGB_v4_ICC_preference.icc'));
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
async function embedXmp(pdfDoc, xmpPath = "zugferd.xmp") {
  const xmpTemplate = fs.readFileSync(path.resolve(__dirname, xmpPath), "utf8");
  pdfDoc.setMetadata(xmpTemplate);
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

// ZUGFeRD XML generator
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
        </ram:ApplicableTradeTax>
        <ram:TradeSettlementLineAmount>${item.total.toFixed(2)}</ram:TradeSettlementLineAmount>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>
    `).join("")}
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}

module.exports = { embedIccProfile, embedXmp, embedXmlIntoPdf, generateZugferdXML };
