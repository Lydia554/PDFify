const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { PDFDocument, rgb, PDFName, PDFHexString, PDFString } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const crypto = require("crypto");
const { finalizePdf } = require("../../Helpers/pdf-helpers");

// ---------------------
// Map Shopify order → PDF data
// ---------------------
function mapOrderToPdfData(order, shopConfig = {}) {
  console.log("🟢 Mapping order to PDF data");
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
// Create base PDF with embedded fonts + XMP metadata + DefaultRGB + OutputIntent + /ID
// ---------------------
async function createBasePdf(data) {
  console.log("🟢 Starting createBasePdf");
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  console.log("📄 PDFDocument created and fontkit registered");

  const regularFontBytes = fs.readFileSync(path.resolve(__dirname, "../../../templates/fonts/LiberationSans-Regular.ttf"));
  const boldFontBytes = fs.readFileSync(path.resolve(__dirname, "../../../templates/fonts/LiberationSans-Bold.ttf"));
  const regularFont = await pdfDoc.embedFont(regularFontBytes);
  const boldFont = await pdfDoc.embedFont(boldFontBytes);
  console.log("🔤 Fonts embedded");

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
  console.log("📝 Drawing page header");
  page.drawRectangle({ x: 0, y: 780, width: 595, height: 40, color: rgb(0.18, 0.31, 0.61) });
  if (data.logoPath && fs.existsSync(data.logoPath)) {
    const logoBytes = fs.readFileSync(data.logoPath);
    const logoImage = await pdfDoc.embedPng(logoBytes);
    const logoDims = logoImage.scale(0.25);
    page.drawImage(logoImage, { x: 40, y: 784 - logoDims.height / 2, width: logoDims.width, height: logoDims.height });
    console.log("🖼 Logo embedded");
  }

  page.drawText(String(data.companyName || "YOUR COMPANY GMBH"), { x: 220, y: 794, size: 16, font: boldFont, color: rgb(1, 1, 1) });
  page.drawText(`INVOICE #${String(data.orderId || "UNKNOWN")}`, { x: 50, y, size: 18, font: boldFont, color: rgb(0.2, 0.2, 0.7) });
  page.drawText(`Date: ${String(data.date)}`, { x: 50, y: y - 20, size: 12, font: regularFont });
  page.drawText(`Customer: ${String(data.customerName)}`, { x: 50, y: y - 40, size: 12, font: regularFont });

  // Table
  console.log("📊 Drawing table");
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

  // XMP metadata
  console.log("🗂 Adding XMP metadata");
  const now = new Date().toISOString();
  const docId = `uuid:${crypto.randomUUID()}`;
  const instId = `uuid:${crypto.randomUUID()}`;
  const xmp = `<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?>
<x:xmpmeta xmlns:x='adobe:ns:meta/' x:xmptk='pdf-lib'>
  <rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>
    <rdf:Description rdf:about=""
      xmlns:xmp='http://ns.adobe.com/xap/1.0/'
      xmlns:pdfaid='http://www.aiim.org/pdfa/ns/id/'
      xmlns:xmpMM='http://ns.adobe.com/xap/1.0/mm/'
      xmlns:dc='http://purl.org/dc/elements/1.1/'
      pdfaid:part="3"
      pdfaid:conformance="B">
      <xmp:CreateDate>${now}</xmp:CreateDate>
      <xmp:ModifyDate>${now}</xmp:ModifyDate>
      <xmpMM:DocumentID>${docId}</xmpMM:DocumentID>
      <xmpMM:InstanceID>${instId}</xmpMM:InstanceID>
      <dc:title><rdf:Alt><rdf:Li xml:lang="x-default">Invoice ${data.orderId}</rdf:Li></rdf:Alt></dc:title>
      <dc:creator><rdf:Seq><rdf:Li>${data.creator}</rdf:Li></rdf:Seq></dc:creator>
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
  console.log("✅ XMP metadata embedded");

  // Trailer /ID
  try {
    console.log("🆔 Setting trailer ID via catalog instead of context.trailer");
    const id1 = PDFHexString.fromText(crypto.randomBytes(16).toString("hex"));
    const id2 = PDFHexString.fromText(crypto.randomBytes(16).toString("hex"));
    pdfDoc.catalog.set(PDFName.of("ID"), pdfDoc.context.obj([id1, id2]));
    console.log("✅ Trailer ID set via catalog");
  } catch (err) {
    console.error("❌ Error setting trailer ID:", err);
  }

  // DefaultRGB + OutputIntent
  try {
    console.log("🎨 Setting DefaultRGB color space + OutputIntent");
    const iccProfilePath =
      process.env.ICC_PROFILE_PATH && fs.existsSync(process.env.ICC_PROFILE_PATH)
        ? process.env.ICC_PROFILE_PATH
        : "/usr/share/color/icc/ghostscript/srgb.icc";
    const iccProfileBytes = fs.readFileSync(iccProfilePath);

    const iccStream = pdfDoc.context.flateStream(iccProfileBytes, {
      N: 3,
      Alternate: PDFName.of("DeviceRGB"),
      Subtype: PDFName.of("ICCBased"),
    });
    const iccRef = pdfDoc.context.register(iccStream);

    pdfDoc.catalog.set(
      PDFName.of("OutputIntents"),
      pdfDoc.context.obj([
        {
          Type: PDFName.of("OutputIntent"),
          S: PDFName.of("GTS_PDFA1"),
          DestOutputProfile: iccRef,
          OutputConditionIdentifier: PDFString.of("sRGB IEC61966-2.1"),
          Info: PDFString.of("sRGB IEC61966-2.1"),
        },
      ])
    );

    const sRGBProfile = pdfDoc.context.obj({
      N: 3,
      Range: [0, 1, 0, 1, 0, 1],
      Alternate: PDFName.of("DeviceRGB"),
    });
    const sRGBRef = pdfDoc.context.register(sRGBProfile);
    pdfDoc.catalog.set(PDFName.of("DefaultRGB"), sRGBRef);

    console.log("✅ DefaultRGB + OutputIntent set");
  } catch (err) {
    console.error("❌ Error setting DefaultRGB/OutputIntent:", err);
  }

  const buffer = Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
  console.log("💾 Base PDF saved, size:", buffer.length);
  return buffer;
}

// ---------------------
// Merchant PDF: Ghostscript + ZUGFeRD
// ---------------------
async function createMerchantPdf(invoiceData) {
  console.log("🟢 Starting createMerchantPdf");
  let pdfBuffer;
  try {
    pdfBuffer = await createBasePdf(invoiceData);
  } catch (err) {
    console.error("❌ createBasePdf failed:", err);
    throw err;
  }

  const tmpDir = path.join(__dirname, "../../tmp_gs");
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmpInput = path.join(tmpDir, `input-${Date.now()}.pdf`);
  const tmpOutput = path.join(tmpDir, `output-${Date.now()}.pdf`);
  fs.writeFileSync(tmpInput, pdfBuffer);
  console.log("💾 Base PDF written to tmp:", tmpInput);

  const iccProfilePath =
    process.env.ICC_PROFILE_PATH && fs.existsSync(process.env.ICC_PROFILE_PATH)
      ? process.env.ICC_PROFILE_PATH
      : "/usr/share/color/icc/ghostscript/srgb.icc";

  console.log("👻 Running Ghostscript...");
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

  if (gs.error || gs.status !== 0) {
    console.error("❌ Ghostscript failed:", gs.error || gs.stderr);
    throw new Error(`Ghostscript PDF/A-3b conversion failed: ${gs.stderr}`);
  }
  console.log("👻 Ghostscript completed, output:", tmpOutput);

  pdfBuffer = fs.readFileSync(tmpOutput);

  console.log("🗃 Re-embedding ZUGFeRD XML...");
  try {
    const zugferdData = await finalizePdf(pdfBuffer, invoiceData);
    pdfBuffer = Buffer.from(zugferdData);
    console.log("✅ ZUGFeRD XML embedded");
  } catch (err) {
    console.error("❌ finalizePdf failed:", err);
  }

  console.log("📦 createMerchantPdf completed, size:", pdfBuffer.length);
  return pdfBuffer;
}

module.exports = {
  mapOrderToPdfData,
  createBasePdf,
  createMerchantPdf,
};
