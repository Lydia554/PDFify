const { PDFName } = require("pdf-lib");

function embedXmlIntoPdf(pdfDoc, xmlContent) {
  const xmlBuffer = Buffer.from(xmlContent, "utf8");
  const fileSpecDict = pdfDoc.context.obj({
    Type: "Filespec",
    F: "zugferd-invoice.xml",
    UF: "zugferd-invoice.xml",
    AFRelationship: "Data",
    Desc: "ZUGFeRD Invoice XML",
    EF: { F: pdfDoc.context.stream(xmlBuffer) },
  });

  const fileSpecRef = pdfDoc.context.register(fileSpecDict);
  pdfDoc.catalog.set(PDFName.of("AF"), pdfDoc.context.obj([fileSpecRef]));

  return fileSpecRef;
}

module.exports = { embedXmlIntoPdf };
