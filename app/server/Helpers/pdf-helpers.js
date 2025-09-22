const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, PDFName, PDFString } = require("pdf-lib");
const { execSync } = require("child_process");

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
        OutputConditionIdentifier: PDFString.of("sRGB2014"),
        Info: PDFString.of("sRGB2014"),
        DestOutputProfile: iccRef,
      }),
    ])
  );
}

/**
 * Embed XMP metadata with PDF/A-3b schema
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
  const xmlStream = pdfDoc.context.flateStream(xmlBuffer, { Subtype: PDFName.of("application/xml") });
  const xmlStreamRef = pdfDoc.context.register(xmlStream);

  const fileSpecDict = pdfDoc.context.obj({
    Type: PDFName.of("Filespec"),
    F: PDFString.of(fileName),
    UF: PDFString.of(fileName),
    Desc: PDFString.of("ZUGFeRD Invoice XML"),
    EF: pdfDoc.context.obj({ F: xmlStreamRef }),
    AFRelationship: PDFName.of("Data"),
  });

  const fileSpecRef = pdfDoc.context.register(fileSpecDict);
  pdfDoc.catalog.set(PDFName.of("AF"), pdfDoc.context.obj([fileSpecRef]));

  // Name tree for embedded files (VeraPDF compliance)
  const efNames = pdfDoc.context.obj({ Names: [PDFString.of(fileName), fileSpecRef] });
  const efNameTreeRef = pdfDoc.context.register(efNames);
  const namesDict = pdfDoc.context.obj({ EmbeddedFiles: efNameTreeRef });
  const namesDictRef = pdfDoc.context.register(namesDict);
  pdfDoc.catalog.set(PDFName.of("Names"), namesDictRef);

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
 * Enforce PDF/A-3b via Ghostscript
 */
function enforcePdfA3b(inputPath, outputPath) {
  const gsCmd = `gs -dPDFA=3 -dBATCH -dNOPAUSE -dNOOUTERSAVE -sProcessColorModel=DeviceRGB \
-sDEVICE=pdfwrite -sPDFACompatibilityPolicy=1 -sOutputFile="${outputPath}" "${inputPath}"`;
  execSync(gsCmd, { stdio: "inherit" });
}

/**
 * All-in-one post-process PDF
 */
async function postProcessPdf(pdfBytes, invoiceData, xmpTemplatePath = null) {
  const pdfDoc = await PDFDocument.load(pdfBytes);

  await embedIccProfile(pdfDoc);

  const zugferdXml = generateZugferdXML(invoiceData);
  embedXmlIntoPdf(pdfDoc, zugferdXml);

  await embedXmp(pdfDoc, xmpTemplatePath, {
    title: `Invoice ${invoiceData.orderId}`,
    creator: invoiceData.creator || "PDFify",
    language: invoiceData.locale?.language || "en",
  });

  // Proper trailer ID
  const id = crypto.randomBytes(16).toString("hex");
  pdfDoc.context.trailer.set(PDFName.of("ID"), pdfDoc.context.obj([PDFString.of(id), PDFString.of(id)]));

  // Save PDF to temp for Ghostscript
  const tempInput = path.resolve(__dirname, "temp-input.pdf");
  const tempOutput = path.resolve(__dirname, "temp-output.pdf");
  fs.writeFileSync(tempInput, await pdfDoc.save({ useObjectStreams: false }));

  // Ghostscript enforcement
  enforcePdfA3b(tempInput, tempOutput);

  const finalPdf = fs.readFileSync(tempOutput);

  fs.unlinkSync(tempInput);
  fs.unlinkSync(tempOutput);

  return finalPdf;
}

module.exports = {
  embedIccProfile,
  embedXmp,
  embedXmlIntoPdf,
  generateZugferdXML,
  enforcePdfA3b,
  postProcessPdf,
};
