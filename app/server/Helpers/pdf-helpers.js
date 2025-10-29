// -----------------------------
// pdf-helpers.js
// -----------------------------
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const os = require("os");
const util = require("util");
const execFileAsync = util.promisify(execFile);
const { PDFName, PDFString, PDFDocument } = require("pdf-lib");

const ICC_PROFILE_PATH = process.env.ICC_PROFILE_PATH || path.join(__dirname, "sRGB_v4_ICC_preference.icc");

/**
 * Step 1 – Clean PDF buffer: remove any leading garbage before %PDF-
 */
function cleanPdfBuffer(buf) {
  const pdfStart = buf.indexOf(Buffer.from("%PDF-"));
  if (pdfStart > 0) return buf.slice(pdfStart);
  return buf;
}

/**
 * Step 2 – Embed XMP metadata
 */
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

/**
 * Step 3 – Embed ZUGFeRD XML into PDFDocument
 */
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

/**
 * Step 4 – Convert to PDF/A-3b with Ghostscript while preserving XML
 */
async function makePdfA3b(pdfBuffer, options = {}) {
  // Clean PDF first
  pdfBuffer = cleanPdfBuffer(pdfBuffer);

  const tmpIn = path.join(os.tmpdir(), `input_${Date.now()}.pdf`);
  const tmpOut = path.join(os.tmpdir(), `output_${Date.now()}.pdf`);
  await fs.promises.writeFile(tmpIn, pdfBuffer);

  // Ghostscript executable detection
  let gsExecutable = "gs";
  if (process.platform === "win32") gsExecutable = "gswin64c";

  const iccPath = options.iccProfilePath || ICC_PROFILE_PATH;
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
    "-dPassThroughAF=true",
    tmpIn,
  ];

  try {
    await execFileAsync(gsExecutable, gsArgs, { encoding: "utf8" });
    return await fs.promises.readFile(tmpOut);
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
    const orderId = data.invoiceNumber || data.orderId || "UNKNOWN";
    const date = data.date || new Date().toISOString().split("T")[0];
    const items = Array.isArray(data.items) ? data.items : [];

    return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:ferd:CrossIndustryDocument:invoice:2p1"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:12"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:15">
  <rsm:ExchangedDocument>
    <ram:ID>${orderId}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${date.replace(/-/g, "")}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    ${items.map((item, i) => `
      <ram:IncludedSupplyChainTradeLineItem>
        <ram:AssociatedDocumentLineDocument>
          <ram:LineID>${i + 1}</ram:LineID>
        </ram:AssociatedDocumentLineDocument>
        <ram:SpecifiedTradeProduct>
          <ram:Name>${item.name || item.description || ""}</ram:Name>
        </ram:SpecifiedTradeProduct>
      </ram:IncludedSupplyChainTradeLineItem>
    `).join("")}
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
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


/**
 * Finalize PDF: embed XML, embed XMP, and convert to PDF/A-3b
 */
async function finalizePdfWithXml(originalBuffer, xml, options = {}) {
  let pdfDoc = await PDFDocument.load(originalBuffer);

  // Embed XML
  pdfDoc = embedXmlIntoPdf(pdfDoc, xml);

  // Embed XMP metadata
  pdfDoc = await embedXmp(pdfDoc);

  // Write intermediate buffer
  const intermediateBuffer = await pdfDoc.save();

  // Skip Ghostscript if requested
  if (options.skipGs) return intermediateBuffer;

  // Convert to PDF/A-3b with XML preserved
  const pdfA3bBuffer = await makePdfA3b(intermediateBuffer, options);
  return pdfA3bBuffer;
}



module.exports = {
  generateZugferdXML,
  embedXmp,
  embedXmlIntoPdf,
  makePdfA3b,
  finalizePdfWithXml
};
