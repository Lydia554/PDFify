const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
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
    customerEmail: order.customer?.email,
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
// Create Merchant PDF (using pdf-lib)
// ---------------------
async function createMerchantPdf(invoiceData) {
  console.log("🚀 STARTING NEW PDF-LIB-BASED PDF GENERATION 🚀");
  console.log("🟢 Starting createMerchantPdf with pdf-lib");

  try {
    const pdfDoc = await PDFDocument.create();
    
    // Embed Liberation Sans font
    const fontBytes = fs.readFileSync(path.join(__dirname, "../../../templates/fonts/LiberationSans-Regular.ttf"));
    const customFont = await pdfDoc.embedFont(fontBytes);

    const page = pdfDoc.addPage([595.28, 841.89]); // A4 size
    const { width, height } = page.getSize();
    const margin = 40;
    const fontColor = rgb(0, 0, 0);
    let y = height - margin;

    // Title
    page.drawText(`Invoice for ${invoiceData.customerName || "Customer"}`, {
      x: margin,
      y,
      font: customFont,
      size: 24,
      color: fontColor,
    });
    y -= 40;

    // Header Info
    const headerText = [
      `Order ID: ${invoiceData.orderId || ""}`,
      `Date: ${invoiceData.date || ""}`,
      `Customer: ${invoiceData.customerName || ""}`,
      `Email: ${invoiceData.customerEmail || ""}`,
      `IBAN: ${invoiceData.iban || ""}`,
      `BIC: ${invoiceData.bic || ""}`,
      `Payment Terms: ${invoiceData.paymentTerms || ""}`,
    ];
    headerText.forEach(text => {
      page.drawText(text, { x: margin, y, font: customFont, size: 12, color: fontColor });
      y -= 20;
    });
    y -= 20;

    // Table Header
    const tableTop = y;
    const tableHeaders = ["Item", "Quantity", "Price", "Net", "Tax", "Total"];
    const colWidths = [200, 70, 70, 70, 70, 70];
    let x = margin;

    tableHeaders.forEach((header, i) => {
      page.drawText(header, { x: x + 5, y: y - 15, font: customFont, size: 12, color: fontColor });
      x += colWidths[i];
    });
    y -= 30;

    // Table Rows
    (invoiceData.items || []).forEach(item => {
      const row = [
        item.name || "",
        String(item.quantity || ""),
        String(item.price || ""),
        String(item.net || "-"),
        String(item.tax || "-"),
        String(item.total || ""),
      ];
      x = margin;
      row.forEach((cell, i) => {
        page.drawText(cell, { x: x + 5, y: y - 15, font: customFont, size: 12, color: fontColor });
        x += colWidths[i];
      });
      y -= 30;
    });

    // Draw table lines
    const tableBottom = y + 10;
    x = margin;
    page.drawRectangle({
        x: margin,
        y: tableBottom,
        width: colWidths.reduce((a,b) => a+b, 0),
        height: tableTop - tableBottom,
        borderColor: fontColor,
        borderWidth: 1,
    });

    y -= 30; // space for totals

    // Totals
    const totals = [
      { label: "Subtotal", value: invoiceData.subtotal },
      { label: `Tax (${invoiceData.vatRate || "21"}%)`, value: invoiceData.tax },
      { label: "Total", value: invoiceData.total },
    ];
    
    totals.forEach(({ label, value }) => {
      page.drawText(label, { x: margin + 350, y, font: customFont, size: 12, color: fontColor });
      page.drawText(String(value), { x: margin + 480, y, font: customFont, size: 12, color: fontColor });
      y -= 20;
    });
    y -= 20;

    // Total Amount Due
    page.drawText(`Total Amount Due: ${invoiceData.total || ""}`, {
      x: margin,
      y,
      font: customFont,
      size: 14,
      color: fontColor
    });

    const pdfLibBuffer = await pdfDoc.save();

    // Finalize the PDF with PDF/A-3b compliance and ZUGFeRD embedding
    const finalPdfBuffer = await finalizePdf(pdfLibBuffer, invoiceData);

    console.log("✅ PDF/A-3b generation with ZUGFeRD complete. Returning final PDF.");
    return finalPdfBuffer;
    
  } catch (err) {
    console.error("❌ createMerchantPdf failed:", err);
    throw err;
  }
}

module.exports = {
  mapOrderToPdfData,
  createMerchantPdf, 
};
