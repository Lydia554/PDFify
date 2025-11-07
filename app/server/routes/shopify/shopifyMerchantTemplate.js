const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { PDFDocument, rgb, PDFName, PDFString, PDFHexString } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const { finalizePdf } = require("../../Helpers/pdf-helpers");

// ---------------------
// Map Shopify order → PDF data
// ---------------------
function mapOrderToPdfData(order, shopConfig = {}) {
  const items = (order.line_items || []).map((item, index) => {
    const price = parseFloat(item.price || 0);
    const quantity = parseFloat(item.quantity || 1);
    const tax = (item.tax_lines || []).reduce((sum, t) => sum + parseFloat(t.price || 0), 0);
    const net = price * quantity;
    const total = net + tax;

    return {
      position: index + 1,
      name: item.title || item.name || "Item",
      quantity,
      unitCode: "EA",
      price,
      net,
      tax,
      total,
      taxRate: 21,
      currency: order.currency || "EUR",
    };
  });

  const subtotal = items.reduce((sum, i) => sum + i.net, 0);
  const taxTotal = items.reduce((sum, i) => sum + i.tax, 0);
  const total = subtotal + taxTotal;

  return {
    orderId: order.name || order.id,
    date: order.created_at ? new Date(order.created_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    customerName: `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim() || "Valued Customer",
    items,
    subtotal,
    tax: taxTotal,
    total,
    vatRate: 21,
    currency: order.currency || "EUR",
    iban: shopConfig.iban || "DE89370400440532013000",
    bic: shopConfig.bic || "COBADEFFXXX",
    paymentTerms: order.payment?.terms || "Due within 14 days",
    creator: "PDFify",
    companyName: shopConfig.companyName || "YOUR COMPANY GMBH",
    locale: { language: order.locale || "en" },
  };
}

// ---------------------
// Create base PDF with embedded fonts, XMP metadata, and DefaultRGB
// ---------------------
async function createBasePdf(data) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const regularFontBytes = fs.readFileSync(path.resolve(__dirname, "../../../templates/fonts/LiberationSans-Regular.ttf"));
  const boldFontBytes = fs.readFileSync(path.resolve(__dirname, "../../../templates/fonts/LiberationSans-Bold.ttf"));
  const regularFont = await pdfDoc.embedFont(regularFontBytes);
  const boldFont = await pdfDoc.embedFont(boldFontBytes);

  const page = pdfDoc.addPage([595, 842]);
  let y = 780;
  const rowHeight = 24;
  const colWidths = [180, 60, 80, 80, 80];
  const headers = ["Item", "Qty", "Price", "Tax", "Total"];

  const asciiSafe = (str) => (str ? str.replace(/[^\x20-\x7E]/g, "") : " ");

  data.customerName = asciiSafe(data.customerName);
  data.companyName = asciiSafe(data.companyName);
  data.items.forEach((i) => (i.name = asciiSafe(i.name)));

  // Header
  page.drawRectangle({ x: 0, y: 780, width: 595, height: 40, color: rgb(0.18, 0.31, 0.61) });

  if (data.logoPath && fs.existsSync(data.logoPath)) {
    const logoBytes = fs.readFileSync(data.logoPath);
    const logoImage = await pdfDoc.embedPng(logoBytes);
    const logoDims = logoImage.scale(0.25);
    page.drawImage(logoImage, { x: 40, y: 784 - logoDims.height / 2, width: logoDims.width, height: logoDims.height });
  }

  page.drawText(String(data.companyName || "YOUR COMPANY GMBH"), { x: 220, y: 794, size: 16, font: boldFont, color: rgb(1, 1, 1) });
  page.drawText(`INVOICE #${String(data.orderId || "UNKNOWN")}`, { x: 50, y, size: 18, font: boldFont, color: rgb(0.2, 0.2, 0.7) });
  page.drawText(`Date: ${String(data.date)}`, { x: 50, y: y - 20, size: 12, font: regularFont });
  page.drawText(`Customer: ${String(data.customerName)}`, { x: 50, y: y - 40, size: 12, font: regularFont });

  // Table
  y -= 70;
  let x = 50;
  headers.forEach((header, i) => {
    page.drawText(asciiSafe(header), { x, y, size: 10, font: boldFont });
    x += colWidths[i];
  });
  y -= rowHeight;

  data.items.forEach((item) => {
    let x = 50;
    const row = [item.name, String(item.quantity), item.price.toFixed(2), item.tax.toFixed(2), item.total.toFixed(2)];
    row.forEach((cell, i) => {
      page.drawText(cell, { x, y, size: 10, font: regularFont });
      x += colWidths[i];
    });
    y -= rowHeight;
  });

  // ---------- Extended XMP metadata ----------
  const now = new Date().toISOString();
  const xmp = `<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?>
<x:xmpmeta xmlns:x='adobe:ns:meta/' x:xmptk='pdf-lib'>
  <rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>
    <rdf:Description rdf:about=''
      xmlns:xmp='http://ns.adobe.com/xap/1.0/'
      xmlns:pdfaid='http://www.aiim.org/pdfa/ns/id/'
      xmlns:xmpMM='http://ns.adobe.com/xap/1.0/mm/'
      xmlns:dc='http://purl.org/dc/elements/1.1/'>
      <xmp:CreateDate>${now}</xmp:CreateDate>
      <xmp:ModifyDate>${now}</xmp:ModifyDate>
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end='w'?>`;

  const metadataStream = pdfDoc.context.stream(Buffer.from(xmp, "utf8"), {
    Type: PDFName.of("Metadata"),
    Subtype: PDFName.of("XML"),
  });
  pdfDoc.catalog.set(PDFName.of("Metadata"), pdfDoc.context.register(metadataStream));
  pdfDoc.catalog.set(PDFName.of("MarkInfo"), pdfDoc.context.obj({ Marked: true }));

  // ---------- Trailer /ID ----------
  const idHex = PDFHexString.fromText(`${Date.now()}`);
  pdfDoc.context.trailer.set(PDFName.of("ID"), pdfDoc.context.obj([idHex, idHex]));

  // ---------- DefaultRGB color space ----------
 const sRGBProfile = pdfDoc.context.obj({
  N: 3,
  Range: [0, 1, 0, 1, 0, 1],
  Alternate: PDFName.of("DeviceRGB"),
});
const sRGBRef = pdfDoc.context.register(sRGBProfile);
pdfDoc.catalog.set(PDFName.of("DefaultRGB"), sRGBRef);


  return Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
}

// ---------------------
// Merchant PDF: Ghostscript + ZUGFeRD pipeline
// ---------------------
async function createMerchantPdf(invoiceData) {
  let pdfBuffer = await createBasePdf(invoiceData);

  const tmpDir = path.join(__dirname, "../../tmp_gs");
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmpInput = path.join(tmpDir, `input-${Date.now()}.pdf`);
  const tmpOutput = path.join(tmpDir, `output-${Date.now()}.pdf`);
  fs.writeFileSync(tmpInput, pdfBuffer);

  const iccProfilePath =
    process.env.ICC_PROFILE_PATH && fs.existsSync(process.env.ICC_PROFILE_PATH)
      ? process.env.ICC_PROFILE_PATH
      : "/usr/share/color/icc/ghostscript/srgb.icc";

  const gs = spawnSync(
    "gs",
    [
      "-dPDFA=3",
      "-dPDFACompatibilityPolicy=1",
      "-sDEVICE=pdfwrite",
      "-dNOPAUSE",
      "-dBATCH",
      "-dNOSAFER",
      "-dEmbedAllFonts=true",
      "-dSubsetFonts=true",
      "-dCompressFonts=true",
      "-dProcessColorModel=/DeviceRGB",
      "-sColorConversionStrategy=RGB",
      "-dUseCIEColor",
      `-sOutputICCProfile=${iccProfilePath}`,
      `-sOutputFile=${tmpOutput}`,
      tmpInput,
    ],
    { encoding: "utf-8" }
  );

  if (gs.error || gs.status !== 0)
    throw new Error(`Ghostscript PDF/A-3b conversion failed: ${gs.stderr}`);

  pdfBuffer = fs.readFileSync(tmpOutput);

  // Re-embed ZUGFeRD XML
  const zugferdData = await finalizePdf(pdfBuffer, invoiceData);
  pdfBuffer = Buffer.from(zugferdData);

  return pdfBuffer;
}

// ---------------------
// Optional helper for direct ZUGFeRD-only generation
// ---------------------
async function createShopifyInvoiceZugferd(order, shopConfig = {}) {
  const data = mapOrderToPdfData(order, shopConfig);
  const pdfBuffer = await createBasePdf(data);
  const finalBuffer = await finalizePdf(pdfBuffer, data);

  const outputDir = path.resolve(__dirname, "../Generated");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `Invoice-ZUGFeRD-${data.orderId}.pdf`);
  fs.writeFileSync(outputPath, finalBuffer);
  console.log(`✅ Final ZUGFeRD PDF saved: ${outputPath}`);

  return { pdfPath: outputPath, pdfBuffer: finalBuffer };
}

module.exports = {
  mapOrderToPdfData,
  createBasePdf,
  createMerchantPdf,
  createShopifyInvoiceZugferd,
};
