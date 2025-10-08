// -----------------------------
// pdf-helpers.js
// -----------------------------
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const os = require("os");
const util = require("util");
const execFileAsync = util.promisify(execFile);

/**
 * Embed XMP metadata into PDF (placeholder)
 * @param {PDFDocument} pdfDoc
 */
async function embedXmp(pdfDoc) {
  // Add XMP metadata embedding if needed
  return pdfDoc;
}

/**
 * Embed ZUGFeRD XML into PDF (placeholder)
 * @param {PDFDocument} pdfDoc
 * @param {string} xml
 */
function embedXmlIntoPdf(pdfDoc, xml) {
  // Real embedding happens here in production
}

/**
 * Post-process PDF for PDF/A-3b compliance and ICC embedding using Ghostscript
 * @param {Buffer} pdfBuffer
 * @param {Object} options
 */
async function makePdfA3b(pdfBuffer, options = {}) {
  const iccPath = options.iccProfilePath || path.join(__dirname, "sRGB_v4_ICC_preference.icc"); 
  const tmpIn = path.join(os.tmpdir(), `input_${Date.now()}.pdf`);
  const tmpOut = path.join(os.tmpdir(), `output_${Date.now()}.pdf`);

  const logDir = path.join(__dirname, "../logs");
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `gs_log_${Date.now()}.txt`);

  // Pre-checks
  if (!fs.existsSync(iccPath)) {
    const msg = `[makePdfA3b] ICC profile missing: ${iccPath}`;
    await fs.promises.writeFile(logFile, msg);
    console.error(msg);
    return pdfBuffer;
  }
  if (!pdfBuffer || pdfBuffer.length === 0) {
    const msg = `[makePdfA3b] Input PDF buffer is empty`;
    await fs.promises.writeFile(logFile, msg);
    console.error(msg);
    return pdfBuffer;
  }

  await fs.promises.writeFile(tmpIn, pdfBuffer);

  const gsArgs = [
    "-dPDFA",
    "-dBATCH",
    "-dNOPAUSE",
    "-sProcessColorModel=DeviceRGB",
    "-sDEVICE=pdfwrite",
    `-sOutputFile=${tmpOut}`,
    "-sPDFACompatibilityPolicy=1",
    "-dEmbedAllFonts=true",
    "-dAutoRotatePages=/None",
    "-dColorConversionStrategy=/sRGB",
    `-sOutputICCProfile=${iccPath}`,
    tmpIn,
  ];

  try {
    console.log("[makePdfA3b] Running Ghostscript command:", "gs", gsArgs.join(" "));
    await execFileAsync("gs", gsArgs, { encoding: "utf8" });

    console.log("[makePdfA3b] PDF/A-3b conversion successful");
    await fs.promises.appendFile(logFile, `[SUCCESS] Converted PDF: ${tmpOut}\n`);

    const finalBuffer = await fs.promises.readFile(tmpOut);
    return finalBuffer;

  } catch (err) {
    const logContent = `
[makePdfA3b] Ghostscript conversion failed
Tmp Input: ${tmpIn}
Tmp Output: ${tmpOut}
ICC Path: ${iccPath}
GS Command: gs ${gsArgs.join(" ")}
Error: ${err.message}
Stdout: ${err.stdout || ""}
Stderr: ${err.stderr || ""}
PDF Buffer Size: ${pdfBuffer.length} bytes
`;
    await fs.promises.writeFile(logFile, logContent);
    console.error(logContent);
    console.error(`[makePdfA3b] Ghostscript error logged to: ${logFile}`);
    return pdfBuffer; // fallback
  } finally {
    fs.unlink(tmpIn, () => {});
    fs.unlink(tmpOut, () => {});
  }
}

/**
 * Generate ZUGFeRD XML based on invoice source (mode)
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
          <ram:Name>${item.name || item.description || ''}</ram:Name>
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

  function generateShopifyXML(data) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<InvoiceSource>Shopify</InvoiceSource>
<InvoiceNumber>${orderId}</InvoiceNumber>
<Date>${date}</Date>`;
  }

  function generateWooCommerceXML(data) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<InvoiceSource>WooCommerce</InvoiceSource>
<InvoiceNumber>${orderId}</InvoiceNumber>
<Date>${date}</Date>`;
  }

  const src = (invoiceData.source || invoiceData.invoiceSource || "").toLowerCase();

  switch (src) {
    case "dev":
    case "standard":
    case "pro":
      return generateDevXML(invoiceData);
    case "friendly":
    case "premium":
      return generateFriendlyXML(invoiceData);
    case "shopify":
      return generateShopifyXML(invoiceData);
    case "woocommerce":
      return generateWooCommerceXML(invoiceData);
    default:
      throw new Error(`Unknown invoice source for ZUGFeRD XML: "${src}"`);
  }
}

module.exports = {
  generateZugferdXML,
  embedXmp,
  embedXmlIntoPdf,
  makePdfA3b
};
