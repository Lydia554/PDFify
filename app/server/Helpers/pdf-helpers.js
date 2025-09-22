// pdf-helpers.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, PDFName } = require("pdf-lib");

/**
 * Embed ICC profile for PDF/A compliance
 */
async function embedIccProfile(pdfDoc) {
  const iccPath = path.resolve(__dirname, "../routes/sRGB_v4_ICC_preference.icc");
  const iccBytes = fs.readFileSync(iccPath);

  const iccStream = pdfDoc.context.flateStream(iccBytes);
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

/**
 * Embed dynamic XMP metadata or fallback
 */
async function embedXmp(pdfDoc, xmpTemplatePath = null, localeMeta = {}) {
  let xmpContent = "";
  if (xmpTemplatePath && fs.existsSync(xmpTemplatePath)) {
    xmpContent = fs.readFileSync(xmpTemplatePath, "utf8");
  } else {
    xmpContent = `<?xpacket begin='\uFEFF' id='W5M0MpCehiHzreSzNTczkc9d'?>
<x:xmpmeta xmlns:x='adobe:ns:meta/' x:xmptk='PDFify'>
  <rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>
    <rdf:Description rdf:about='' xmlns:pdfaid='http://www.aiim.org/pdfa/ns/id/'>
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end='w'?>`;
  }

  const { title = "Invoice", creator = "PDFify", language = "en" } = localeMeta;
  xmpContent = xmpContent
    .replace(/<dc:title>.*<\/dc:title>/, `<dc:title>${title}</dc:title>`)
    .replace(/<dc:creator>.*<\/dc:creator>/, `<dc:creator>${creator}</dc:creator>`)
    .replace(/<dc:language>.*<\/dc:language>/, `<dc:language>${language}</dc:language>`);

  if (!xmpContent.startsWith("\uFEFF")) xmpContent = "\uFEFF" + xmpContent;

  const metadataStream = pdfDoc.context.flateStream(Buffer.from(xmpContent, "utf8"), {
    Type: PDFName.of("Metadata"),
    Subtype: PDFName.of("XML"),
  });
  const metadataRef = pdfDoc.context.register(metadataStream);
  pdfDoc.catalog.set(PDFName.of("Metadata"), metadataRef);
}

/**
 * Embed ZUGFeRD XML into PDF
 */
function embedXmlIntoPdf(pdfDoc, xmlContent, fileName = "zugferd-invoice.xml") {
  const xmlBuffer = Buffer.from(xmlContent, "utf8");
  const xmlStream = pdfDoc.context.flateStream(xmlBuffer);

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

/**
 * Generate minimal ZUGFeRD XML
 */
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

/**
 * All-in-one post-process for PDF/A-3b + ZUGFeRD
 */
async function postProcessPdf(pdfBytes, invoiceData, xmpTemplatePath = null) {
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // Embed ICC profile
  await embedIccProfile(pdfDoc);

  // Embed ZUGFeRD XML
  const zugferdXml = generateZugferdXML(invoiceData);
  embedXmlIntoPdf(pdfDoc, zugferdXml);

  // Embed XMP metadata (dynamic or template)
  await embedXmp(pdfDoc, xmpTemplatePath, {
    title: `Invoice ${invoiceData.orderId || "PDFify"}`,
    creator: invoiceData.creator || "PDFify",
    language: invoiceData.locale?.language || "en"
  });

  // Add Trailer ID for strict PDF/A-3b
  const id = crypto.randomBytes(16).toString("hex");
  pdfDoc.catalog.set(PDFName.of("ID"), pdfDoc.context.obj([PDFName.of(id), PDFName.of(id)]));

  return await pdfDoc.save({ useObjectStreams: false });
}

module.exports = {
  embedIccProfile,
  embedXmp,
  embedXmlIntoPdf,
  generateZugferdXML,
  postProcessPdf
};
