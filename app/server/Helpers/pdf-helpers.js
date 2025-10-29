const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const util = require("util");
const execFileAsync = util.promisify(execFile);
const { PDFDocument, PDFName, PDFString } = require("pdf-lib");
const { v4: uuidv4 } = require("uuid");

const DEFAULT_ICC = path.join(__dirname, "sRGB_v4_ICC_preference.icc");

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
}

// -----------------------------
// Embed ZUGFeRD XML into PDF
// -----------------------------
function embedXmlIntoPdf(pdfDoc, xml) {
  if (!xml) return;

  const xmlBytes = Buffer.from(xml.trim(), "utf8");
  const xmlStream = pdfDoc.context.flateStream(xmlBytes, {
    Type: PDFName.of("EmbeddedFile"),
    Subtype: PDFName.of("text/xml"),
  });

  const fileSpecDict = pdfDoc.context.obj({
    Type: PDFName.of("Filespec"),
    F: PDFString.of("ZUGFeRD-invoice.xml"),
    UF: PDFString.of("ZUGFeRD-invoice.xml"),
    AFRelationship: PDFName.of("Alternative"),
    EF: { F: xmlStream },
  });

  const fileSpecRef = pdfDoc.context.register(fileSpecDict);
  pdfDoc.catalog.set(PDFName.of("AF"), pdfDoc.context.obj([fileSpecRef]));

  const namesDict = pdfDoc.context.obj({
    EmbeddedFiles: pdfDoc.context.obj({
      Names: [PDFString.of("ZUGFeRD-invoice.xml"), fileSpecRef],
    }),
  });
  pdfDoc.catalog.set(PDFName.of("Names"), namesDict);
}

// -----------------------------
// Embed ICC OutputIntent
// -----------------------------
async function embedIccProfile(pdfDoc, iccPath) {
  if (!fs.existsSync(iccPath)) {
    throw new Error(`ICC profile not found at ${iccPath}`);
  }

  const iccBytes = fs.readFileSync(iccPath);
  const iccStream = pdfDoc.context.stream(iccBytes);
  const iccRef = pdfDoc.context.register(iccStream);

  const outputIntent = pdfDoc.context.obj({
    Type: PDFName.of("OutputIntent"),
    S: PDFName.of("GTS_PDFA1"),
    OutputConditionIdentifier: PDFString.of("sRGB IEC61966-2.1"),
    Info: PDFString.of("sRGB IEC61966-2.1"),
    DestOutputProfile: iccRef,
    RegistryName: PDFString.of("http://www.color.org"),
  });

  const outputIntentRef = pdfDoc.context.register(outputIntent);
  const arrRef = pdfDoc.context.register(pdfDoc.context.obj([outputIntentRef]));
  pdfDoc.catalog.set(PDFName.of("OutputIntents"), arrRef);
}

// -----------------------------
// Make PDF/A-3b with Ghostscript
// -----------------------------
async function makePdfA3b(pdfBuffer, xml, options = {}) {
  const iccPath =
    options.iccProfilePath || process.env.ICC_PROFILE_PATH || process.env.PDFA_ICC_PROFILE || DEFAULT_ICC;

  if (!pdfBuffer || pdfBuffer.length === 0) return pdfBuffer;
  if (!fs.existsSync(iccPath)) throw new Error(`[makePdfA3b] ICC file not found: ${iccPath}`);
  console.log(`[makePdfA3b] Using ICC profile: ${iccPath}`);

  const pdfDoc = await PDFDocument.load(pdfBuffer);

  // Embed XMP, ZUGFeRD XML, and ICC
  await embedXmp(pdfDoc);
  embedXmlIntoPdf(pdfDoc, xml);
  await embedIccProfile(pdfDoc, iccPath);
  console.log("[makePdfA3b] XMP, ICC, and XML embedded into pdf-lib PDF");

  // Save intermediate PDF
  const tmpIn = path.join(os.tmpdir(), `tmp-${uuidv4()}.pdf`);
  const tmpOut = path.join(os.tmpdir(), `tmp-${uuidv4()}-a3b.pdf`);
  fs.writeFileSync(tmpIn, await pdfDoc.save({ useObjectStreams: false }));
  fs.chmodSync(tmpIn, 0o644);

  // Ghostscript command
  const gsCmd = [
    "-dPDFA=3",
    "-dBATCH",
    "-dNOPAUSE",
    "-dNOOUTERSAVE",
    "-sProcessColorModel=DeviceRGB",
    "-sDEVICE=pdfwrite",
    "-sPDFACompatibilityPolicy=1",
    `-sOutputICCProfile=${iccPath}`,
    `-sOutputFile=${tmpOut}`,
    tmpIn,
  ];
  console.log("[makePdfA3b] Running Ghostscript:", gsCmd.join(" "));

  try {
    await execFileAsync("gs", gsCmd);
    console.log(`[makePdfA3b] Ghostscript completed successfully: ${tmpOut}`);
  } catch (err) {
    console.error("[makePdfA3b] Ghostscript error:", err.stderr || err);
    throw err;
  }

  const finalBuffer = fs.readFileSync(tmpOut);

  // Cleanup
  try { fs.unlinkSync(tmpIn); } catch {}
  try { fs.unlinkSync(tmpOut); } catch {}

  console.log("[makePdfA3b] PDF/A-3b buffer size:", finalBuffer.length);
  return finalBuffer;
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
  const currency = data.currency || "EUR";

  // calculate totals
  const totalNet = items.reduce((sum, i) => sum + (i.net || 0), 0);
  const totalTax = items.reduce((sum, i) => sum + (i.tax || 0), 0);
  const totalGross = items.reduce((sum, i) => sum + (i.total || 0), 0);

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:ferd:CrossIndustryDocument:invoice:2p3"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">

  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:ferd:CrossIndustryDocument:invoice:2p3:comfort</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>

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
        <ram:SpecifiedLineTradeSettlement>
          <ram:ApplicableTradeTax>
            <ram:TypeCode>VAT</ram:TypeCode>
            <ram:RateApplicablePercent>${item.taxRate ?? 0}</ram:RateApplicablePercent>
            <ram:CalculatedAmount currencyID="${currency}">${(item.tax || 0).toFixed(2)}</ram:CalculatedAmount>
          </ram:ApplicableTradeTax>
          <ram:SpecifiedTradeSettlementLineMonetarySummation>
            <ram:LineTotalAmount currencyID="${currency}">${(item.total || 0).toFixed(2)}</ram:LineTotalAmount>
          </ram:SpecifiedTradeSettlementLineMonetarySummation>
        </ram:SpecifiedLineTradeSettlement>
      </ram:IncludedSupplyChainTradeLineItem>
    `).join("")}

    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${currency}</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount currencyID="${currency}">${totalNet.toFixed(2)}</ram:LineTotalAmount>
        <ram:TaxTotalAmount currencyID="${currency}">${totalTax.toFixed(2)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount currencyID="${currency}">${totalGross.toFixed(2)}</ram:GrandTotalAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>

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

module.exports = {
  generateZugferdXML,
  embedXmp,
  embedXmlIntoPdf,
  makePdfA3b
};
