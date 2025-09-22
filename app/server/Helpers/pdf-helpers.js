// pdf-helpers.js
const fs = require("fs");
const path = require("path");
const { PDFName } = require("pdf-lib");

// Embed ICC profile for PDF/A
async function embedIccProfile(pdfDoc) {
  const iccBytes = fs.readFileSync(path.resolve(__dirname, "../routes/sRGB_v4_ICC_preference.icc"));
  const iccStream = pdfDoc.context.stream(iccBytes);
  const iccRef = pdfDoc.context.register(iccStream);

  pdfDoc.catalog.set(
    PDFName.of("OutputIntents"),
    pdfDoc.context.obj([
      pdfDoc.context.obj({
        Type: PDFName.of("OutputIntent"),
        S: PDFName.of("GTS_PDFA1"),
        OutputConditionIdentifier: "sRGB IEC61966-2.1",
        Info: "sRGB IEC61966-2.1",
        DestOutputProfile: iccRef,
      }),
    ])
  );
}

// Embed XMP metadata
async function embedXmp(pdfDoc, xmpFileName = "zugferd.xmp") {
  const xmpPath = path.resolve(__dirname, "xmp", xmpFileName);
  const xmpBytes = fs.readFileSync(xmpPath);
  const xmpStream = pdfDoc.context.stream(xmpBytes);
  const xmpRef = pdfDoc.context.register(xmpStream);

  pdfDoc.catalog.set(PDFName.of("Metadata"), xmpRef);
}

// Embed ZUGFeRD XML into PDF
function embedXmlIntoPdf(pdfDoc, xmlContent, fileName = "zugferd-invoice.xml") {
  const xmlBuffer = Buffer.from(xmlContent, "utf8");
  const xmlStream = pdfDoc.context.stream(xmlBuffer);

  const fileSpecDict = pdfDoc.context.obj({
    Type: PDFName.of("Filespec"),
    F: fileName,
    UF: fileName,
    AFRelationship: PDFName.of("Data"),
    Desc: "ZUGFeRD Invoice XML",
    EF: pdfDoc.context.obj({ F: xmlStream }),
  });

  const fileSpecRef = pdfDoc.context.register(fileSpecDict);
  pdfDoc.catalog.set(PDFName.of("AF"), pdfDoc.context.obj([fileSpecRef]));

  return fileSpecRef;
}



function generateZugferdXML(invoiceData) {
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:ferd:CrossIndustryDocument:invoice:2p1">
  <rsm:ExchangedDocument>
    <ram:ID>${invoiceData.orderId}</ram:ID>
    <ram:IssueDateTime>${invoiceData.date}</ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    ${invoiceData.items?.map((item, idx) => `
      <ram:IncludedSupplyChainTradeLineItem>
        <ram:AssociatedDocumentLineDocument>
          <ram:LineID>${idx + 1}</ram:LineID>
        </ram:AssociatedDocumentLineDocument>
        <ram:SpecifiedTradeProduct>
          <ram:Name>${item.name}</ram:Name>
        </ram:SpecifiedTradeProduct>
        <ram:SpecifiedLineTradeSettlement>
          <ram:ApplicableTradeTax>
            <ram:CalculatedAmount>${item.tax}</ram:CalculatedAmount>
            <ram:TypeCode>VAT</ram:TypeCode>
            <ram:RateApplicablePercent>${item.taxRate ?? 21}</ram:RateApplicablePercent>
          </ram:ApplicableTradeTax>
          <ram:TradeSettlementLineAmount>${item.total}</ram:TradeSettlementLineAmount>
          <ram:NetLineAmount>${item.net}</ram:NetLineAmount>
        </ram:SpecifiedLineTradeSettlement>
      </ram:IncludedSupplyChainTradeLineItem>
    `).join("")}
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}

module.exports = { embedIccProfile, embedXmp, embedXmlIntoPdf, generateZugferdXML };

