const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { PDFDocument, rgb, PDFName } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
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
// Create minimal base PDF (Ghostscript-safe)
// ---------------------
async function createBasePdf(data) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const regularFontBytes = fs.readFileSync(path.resolve(__dirname, "../../../templates/fonts/LiberationSans-Regular.ttf"));
  const boldFontBytes = fs.readFileSync(path.resolve(__dirname, "../../../templates/fonts/LiberationSans-Bold.ttf"));
  const regularFont = await pdfDoc.embedFont(regularFontBytes);
  const boldFont = await pdfDoc.embedFont(boldFontBytes);

  // ---------------------
  // DefaultRGB + OutputIntent (minimal, Ghostscript will enforce compliance)
  // ---------------------
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
        OutputConditionIdentifier: "sRGB IEC61966-2.1",
        Info: "sRGB IEC61966-2.1",
      },
    ])
  );

  const sRGBProfile = pdfDoc.context.obj({ N: 3, Range: [0, 1, 0, 1, 0, 1], Alternate: PDFName.of("DeviceRGB") });
  const sRGBRef = pdfDoc.context.register(sRGBProfile);
  pdfDoc.catalog.set(PDFName.of("DefaultRGB"), sRGBRef);

  // ---------------------
  // Create page and draw invoice content
  // ---------------------
  const page = pdfDoc.addPage([595, 842]);
  page.node.set(PDFName.of("Resources"), pdfDoc.context.obj({ ColorSpace: { DeviceRGB: sRGBRef } }));

  let y = 780;
  const rowHeight = 24;
  const colWidths = [180, 60, 80, 80, 80];
  const headers = ["Item", "Qty", "Price", "Tax", "Total"];

  const asciiSafe = (str) => (str ? str.replace(/[^\x20-\x7E]/g, "") : " ");
  data.customerName = asciiSafe(data.customerName);
  data.companyName = asciiSafe(data.companyName);
  data.items.forEach((i) => (i.name = asciiSafe(i.name)));

  // Header rectangle + text
  page.drawRectangle({ x: 0, y: 780, width: 595, height: 40, color: rgb(0.18, 0.31, 0.61) });
  page.drawText(String(data.companyName), { x: 220, y: 794, size: 16, font: boldFont, color: rgb(1, 1, 1) });
  page.drawText(`INVOICE #${String(data.orderId)}`, { x: 50, y, size: 18, font: boldFont, color: rgb(0.2, 0.2, 0.7) });

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

  return Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
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
