const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb } = require("pdf-lib");
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
  console.log(" STARTING PDF-LIB-BASED PDF GENERATION (v - Layout Fix) ");
  console.log(" Starting createMerchantPdf with pdf-lib");

  try {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    
    // Embed Liberation Sans fonts
    const fontBytes = fs.readFileSync(path.join(__dirname, "../../../templates/fonts/LiberationSans-Regular.ttf"));
    const fontBytesBold = fs.readFileSync(path.join(__dirname, "../../../templates/fonts/LiberationSans-Bold.ttf"));
    const customFont = await pdfDoc.embedFont(fontBytes);
    const customFontBold = await pdfDoc.embedFont(fontBytesBold);

    const page = pdfDoc.addPage([595.28, 841.89]); // A4 size
    const { width, height } = page.getSize();
    const margin = 40;
    const fontColor = rgb(0, 0, 0);
    let y = height - margin;

    // Title
    page.drawText(`Invoice for ${invoiceData.customerName || "Customer"}`, {
      x: margin,
      y,
      font: customFontBold,
      size: 24,
      color: fontColor,
    });
    y -= 40;

    // Header Info
    const headerText = [
      {label: "Order ID:", value: invoiceData.orderId || ""},
      {label: "Date:", value: invoiceData.date || ""},
      {label: "Customer:", value: invoiceData.customerName || ""},
      {label: "Email:", value: invoiceData.customerEmail || ""},
      {label: "IBAN:", value: invoiceData.iban || ""},
      {label: "BIC:", value: invoiceData.bic || ""},
      {label: "Payment Terms:", value: invoiceData.paymentTerms || ""},
    ];
    headerText.forEach(item => {
      page.drawText(`${item.label} ${item.value}`, { x: margin, y, font: customFont, size: 11, color: fontColor });
      y -= 20;
    });
    y -= 20;

    // Table Header
    const tableTop = y;
    const tableHeaders = ["Item", "Quantity", "Price", "Net", "Tax", "Total"];
    const colWidths = [220, 60, 60, 60, 60, 70];
    let x = margin;

    page.drawRectangle({ x: margin, y: y - 25, width: colWidths.reduce((a,b) => a+b, 0), height: 25, color: rgb(0.9, 0.9, 0.9) });

    tableHeaders.forEach((header, i) => {
      page.drawText(header, { x: x + 5, y: y - 17, font: customFontBold, size: 11, color: fontColor });
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
        page.drawText(cell, { x: x + 5, y: y - 15, font: customFont, size: 10, color: fontColor });
        x += colWidths[i];
      });
      y -= 30;
    });
     y -= 40;

    // Totals
    const totalsX = 380;
    const totals = [
      { label: "Subtotal", value: invoiceData.subtotal },
      { label: `Tax (${invoiceData.vatRate || "21"}%)`, value: invoiceData.tax },
      { label: "Total", value: invoiceData.total },
    ];
    
    totals.forEach(({ label, value }) => {
      page.drawText(label, { x: totalsX, y, font: customFontBold, size: 12, color: fontColor });
      page.drawText(String(value), { x: width - margin - 70, y, font: customFont, size: 12, color: fontColor });
      y -= 20;
    });
    y -= 20;

    // Total Amount Due
    page.drawText(`Total Amount Due: ${invoiceData.total || ""}`, {
      x: margin,
      y,
      font: customFontBold,
      size: 14,
      color: fontColor
    });

    // Finalize the PDF with PDF/A-3b compliance and ZUGFeRD embedding
    const finalPdfBuffer = await finalizePdf(pdfDoc, invoiceData);

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

