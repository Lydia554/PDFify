const fs = require("fs");
const path = require("path");
const { PDFDocument, PDFName, PDFHexString } = require("pdf-lib");

/**
 * Embed ICC profile for PDF/A compliance
 */
async function embedIccProfile(pdfDoc) {
  const iccPath = path.resolve(__dirname, "sRGB2014.icc");
  const iccBytes = fs.readFileSync(iccPath);

  const iccStream = pdfDoc.context.flateStream(iccBytes);
  const iccRef = pdfDoc.context.register(iccStream);

  pdfDoc.catalog.set(
    PDFName.of("OutputIntents"),
    pdfDoc.context.obj([
      pdfDoc.context.obj({
        Type: PDFName.of("OutputIntent"),
        S: PDFName.of("GTS_PDFA1"),
        OutputConditionIdentifier: "sRGB2014",
        Info: "sRGB2014",
        DestOutputProfile: iccRef,
      }),
    ])
  );
}

/**
 * Embed XMP metadata
 */
async function embedXmp(pdfDoc, xmpTemplatePath = null, localeMeta = {}) {
  const { title = "Invoice", creator = "PDFify", language = "en" } = localeMeta;

  let xmpContent;
  if (xmpTemplatePath && fs.existsSync(xmpTemplatePath)) {
    xmpContent = fs.readFileSync(xmpTemplatePath, "utf8");
  } else {
    xmpContent = `<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?>
<x:xmpmeta xmlns:x='adobe:ns:meta/' x:xmptk='PDFify'>
  <rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>
    <rdf:Description rdf:about=""
        xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"
        xmlns:dc="http://purl.org/dc/elements/1.1/"
        xmlns:xmp="http://ns.adobe.com/xap/1.0/">
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${title}</rdf:li></rdf:Alt></dc:title>
      <dc:creator><rdf:Seq><rdf:li>${creator}</rdf:li></rdf:Seq></dc:creator>
      <dc:language>${language}</dc:language>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end='w'?>`;
  }

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
  const xmlStreamRef = pdfDoc.context.register(xmlStream);

  const fileSpecDict = pdfDoc.context.obj({
    Type: PDFName.of("Filespec"),
    F: PDFHexString.fromText(fileName),
    UF: PDFHexString.fromText(fileName),
    Desc: PDFHexString.fromText("ZUGFeRD Invoice XML"),
    AFRelationship: PDFName.of("Data"),
    EF: pdfDoc.context.obj({ F: xmlStreamRef }),
    Subtype: PDFName.of("application/xml"),
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
    ${invoiceData.items
      ?.map(
        (item, idx) => `
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
    `
      )
      .join("")}
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}

/**
 * Post-process PDF for PDF/A-3b + ZUGFeRD
 */
async function postProcessPdf(pdfBytes, invoiceData, xmpTemplatePath = null) {
  const pdfDoc = await PDFDocument.load(pdfBytes);

  await embedIccProfile(pdfDoc);

  const zugferdXml = generateZugferdXML(invoiceData);
  embedXmlIntoPdf(pdfDoc, zugferdXml);

  await embedXmp(pdfDoc, xmpTemplatePath, {
    title: `Invoice ${invoiceData.orderId || "PDFify"}`,
    creator: invoiceData.creator || "PDFify",
    language: invoiceData.locale?.language || "en",
  });

  // ✅ Set trailer ID safely
  const hexId = PDFHexString.fromText(
    Math.random().toString(36).slice(2, 18) + Math.random().toString(36).slice(2, 18)
  );
  if (!pdfDoc.context.trailer.get(PDFName.of("ID"))) {
    pdfDoc.context.trailer.set(PDFName.of("ID"), pdfDoc.context.obj([hexId, hexId]));
  }

  return await pdfDoc.save({ useObjectStreams: false });
}

module.exports = {
  embedIccProfile,
  embedXmp,
  embedXmlIntoPdf,
  generateZugferdXML,
  postProcessPdf,
};
