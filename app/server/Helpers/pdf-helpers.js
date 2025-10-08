const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");

/**
 * Embed ICC profile into PDF for PDF/A compliance
 * @param {PDFDocument} pdfDoc
 */
async function embedIccProfile(pdfDoc) {
const iccPath = path.join(__dirname, "sRGB_v4_ICC_preference.icc");

  const iccBytes = fs.readFileSync(iccPath);
  if (!pdfDoc.embedIccProfile) {
    throw new Error("pdf-lib version does not support embedIccProfile");
  }
  await pdfDoc.embedIccProfile(iccBytes);
  return pdfDoc;
}


async function embedXmp(pdfDoc) {
  // Add XMP metadata embedding
  return pdfDoc;
}
function embedXmlIntoPdf(pdfDoc, xml) {
  // Embed ZUGFeRD XML into PDF
}
async function makePdfA3b(pdfBuffer) {
  // Optional: Post-process PDF via Ghostscript
  return pdfBuffer;
}

/**
 * Generate ZUGFeRD XML for different invoice sources
 * @param {Object} invoiceData
 * @returns {string} XML content
 */
function generateZugferdXML(invoiceData) {
  const items = Array.isArray(invoiceData.items) ? invoiceData.items : [];
  const orderId = invoiceData.invoiceNumber || invoiceData.orderId || "UNKNOWN";
  const date = invoiceData.date || new Date().toISOString().split("T")[0];

  function generateDevXML(data) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:ferd:CrossIndustryDocument:invoice:2p1">
  <rsm:ExchangedDocument>
    <ram:ID>${orderId}</ram:ID>
    <ram:IssueDateTime>${date}</ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    ${items.map((item, idx) => `
      <ram:IncludedSupplyChainTradeLineItem>
        <ram:AssociatedDocumentLineDocument>
          <ram:LineID>${idx + 1}</ram:LineID>
        </ram:AssociatedDocumentLineDocument>
        <ram:SpecifiedTradeProduct>
          <ram:Name>${item.name}</ram:Name>
        </ram:SpecifiedTradeProduct>
        <ram:SpecifiedLineTradeSettlement>
          <ram:ApplicableTradeTax>
            <ram:CalculatedAmount>${item.tax || 0}</ram:CalculatedAmount>
            <ram:TypeCode>VAT</ram:TypeCode>
            <ram:RateApplicablePercent>${item.taxRate ?? 21}</ram:RateApplicablePercent>
          </ram:ApplicableTradeTax>
          <ram:TradeSettlementLineAmount>${item.total || 0}</ram:TradeSettlementLineAmount>
          <ram:NetLineAmount>${item.net || 0}</ram:NetLineAmount>
        </ram:SpecifiedLineTradeSettlement>
      </ram:IncludedSupplyChainTradeLineItem>
    `).join("")}
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
  }

  function generateFriendlyXML(data) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:ferd:CrossIndustryDocument:invoice:2p1">
  <rsm:ExchangedDocument>
    <ram:ID>${orderId}</ram:ID>
    <ram:IssueDateTime>${date}</ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    ${items.map((item, idx) => {
      const qty = Number(item.quantity) || 0;
      const unitPrice = Number(item.unitPrice) || 0;
      const total = qty * unitPrice;
      const tax = total * ((Number(item.taxRate ?? data.taxRate) || 0) / 100);
      return `
      <ram:IncludedSupplyChainTradeLineItem>
        <ram:AssociatedDocumentLineDocument>
          <ram:LineID>${idx + 1}</ram:LineID>
        </ram:AssociatedDocumentLineDocument>
        <ram:SpecifiedTradeProduct>
          <ram:Name>${item.description || ''}</ram:Name>
        </ram:SpecifiedTradeProduct>
        <ram:SpecifiedLineTradeSettlement>
          <ram:ApplicableTradeTax>
            <ram:CalculatedAmount>${tax.toFixed(2)}</ram:CalculatedAmount>
            <ram:TypeCode>VAT</ram:TypeCode>
            <ram:RateApplicablePercent>${item.taxRate ?? data.taxRate ?? 0}</ram:RateApplicablePercent>
          </ram:ApplicableTradeTax>
          <ram:TradeSettlementLineAmount>${total.toFixed(2)}</ram:TradeSettlementLineAmount>
          <ram:NetLineAmount>${(total - tax).toFixed(2)}</ram:NetLineAmount>
        </ram:SpecifiedLineTradeSettlement>
      </ram:IncludedSupplyChainTradeLineItem>`;
    }).join("")}
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
  }

  switch ((invoiceData.source || invoiceData.invoiceSource || "").toLowerCase()) {
    case "dev":
    case "standard":
      return generateDevXML(invoiceData);
    case "friendly":
    case "premium":
      return generateFriendlyXML(invoiceData);
    default:
      throw new Error("Unknown invoice source for ZUGFeRD XML");
  }
}

module.exports = {
  generateZugferdXML,
  embedIccProfile,
  embedXmp,
  embedXmlIntoPdf,
  makePdfA3b
};
