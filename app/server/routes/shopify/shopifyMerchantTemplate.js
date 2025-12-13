const axios = require("axios");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const { finalizePdf } = require("../../Helpers/pdf-helpers");

/**
 * Convert image URL (PNG, JPG, or SVG) to Base64 string for embedding in PDF
 * @param {string} url 
 * @returns {Promise<string>}
 */
async function getBase64Image(url) {
  if (!url) return null;
  try {
    console.log("🔍 Fetching logo for merchant invoice:", url);
    const response = await axios.get(url, { responseType: "arraybuffer" });
    
    // Use sharp to ensure it's a PNG/JPG, converting SVG if necessary
    const imageBuffer = await sharp(response.data).png().toBuffer();
    
    console.log("✅ Logo processed successfully");
    return imageBuffer;
  } catch (err) {
    console.error("❌ Error fetching or processing logo:", url, err.message);
    return null;
  }
}

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
  console.log("🎨 Starting professional PDF-LIB generation...");

  try {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    // Embed fonts
    const fontBytes = fs.readFileSync(path.join(__dirname, "../../../templates/fonts/LiberationSans-Regular.ttf"));
    const fontBytesBold = fs.readFileSync(path.join(__dirname, "../../../templates/fonts/LiberationSans-Bold.ttf"));
    const font = await pdfDoc.embedFont(fontBytes);
    const fontBold = await pdfDoc.embedFont(fontBytesBold);

    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();
    const margin = 50;
    let y = height - margin;

    // --- Define Colors ---
    const colors = {
      primary: rgb(0.05, 0.11, 0.16),   // Navy
      secondary: rgb(0.25, 0.35, 0.47), // Shadow Blue
      accent: rgb(0.11, 0.60, 0.55),    // Teal
      text: rgb(0.21, 0.23, 0.25),      // Charcoal
      lightGray: rgb(0.97, 0.98, 0.98), // Zebra stripe
      borderColor: rgb(0.87, 0.89, 0.90)
    };

    // --- Header ---
    const headerTop = y;
    if (invoiceData.logoData) {
      const logoImage = await pdfDoc.embedPng(invoiceData.logoData);
      const logoDims = logoImage.scaleToFit(150, 70);
      page.drawImage(logoImage, {
        x: margin,
        y: y - logoDims.height,
        width: logoDims.width,
        height: logoDims.height,
      });
    }

    let headerX = width / 2;
    page.drawText("INVOICE", { x: headerX, y, font: fontBold, size: 28, color: colors.primary });
    y -= 20;
    page.drawText(`Invoice #: ${invoiceData.orderId || ""}`, { x: headerX, y, font: font, size: 10, color: colors.secondary });
    y -= 15;
    page.drawText(`Date: ${invoiceData.date || ""}`, { x: headerX, y, font: font, size: 10, color: colors.secondary });
    y = headerTop - 80; // Reset Y to below header

    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y: y }, thickness: 2, color: colors.primary });
    y -= 30;

    // --- Parties Section ---
    const partiesTop = y;
    page.drawText("From", { x: margin, y, font: fontBold, size: 12, color: colors.secondary });
    y -= 18;
    page.drawText(invoiceData.companyName || "Your Company", { x: margin, y, font: font, size: 10, color: colors.text });

    page.drawText("To", { x: width / 2, y: partiesTop, font: fontBold, size: 12, color: colors.secondary });
    y = partiesTop - 18;
    page.drawText(invoiceData.customerName || "", { x: width / 2, y, font: font, size: 10, color: colors.text });
    y -= 15;
    page.drawText(invoiceData.customerEmail || "", { x: width / 2, y, font: font, size: 10, color: colors.text });

    y -= 40;

    // --- Table Header ---
    const tableTop = y;
    const tableHeaders = ["Item", "Quantity", "Price", "Total"];
    const colX = [margin, 350, 420, 490];

    page.drawRectangle({
      x: margin,
      y: y - 22,
      width: width - margin * 2,
      height: 22,
      color: colors.primary,
    });
    
    tableHeaders.forEach((header, i) => {
      let textX = colX[i] + 5;
      if (i > 0) { // Right-align numeric columns
        const textWidth = fontBold.widthOfTextAtSize(header, 10);
        textX = colX[i] + (colX[i+1] ? colX[i+1] - colX[i] : width - margin - colX[i]) - textWidth - 5;
      }
      page.drawText(header, { x: textX, y: y - 15, font: fontBold, size: 10, color: rgb(1, 1, 1) });
    });
    y -= 30;

    // --- Table Rows ---
    (invoiceData.items || []).forEach((item, index) => {
      const rowY = y;
      // Zebra stripe
      if (index % 2 !== 0) {
        page.drawRectangle({
          x: margin,
          y: rowY - 18,
          width: width - margin * 2,
          height: 30,
          color: colors.lightGray,
        });
      }

      // Draw text for each cell
      const itemText = item.name || "";
      const quantityText = String(item.quantity || "");
      const priceText = item.price.toFixed(2);
      const totalText = item.total.toFixed(2);

      page.drawText(itemText, { x: colX[0] + 5, y: rowY - 15, font: font, size: 10, color: colors.text });
      
      // Right align quantity
      let qtyWidth = font.widthOfTextAtSize(quantityText, 10);
      page.drawText(quantityText, { x: colX[2] - qtyWidth - 5, y: rowY - 15, font: font, size: 10, color: colors.text });
      
      // Right align price
      let priceWidth = font.widthOfTextAtSize(priceText, 10);
      page.drawText(priceText, { x: colX[3] - priceWidth - 5, y: rowY - 15, font: font, size: 10, color: colors.text });

      // Right align total
      let totalWidth = font.widthOfTextAtSize(totalText, 10);
      page.drawText(totalText, { x: width - margin - totalWidth - 5, y: rowY - 15, font: font, size: 10, color: colors.text });

      y -= 30;
    });

    if (y > 150) { // Don't let totals run off page
      y -= 20;
    } else {
      y = 150;
    }
    
    // --- Totals Section ---
    const totalsX = width / 2;
    const totalsLabelX = totalsX;
    const totalsAmountX = width - margin;
    
    const totalsData = [
      { label: "Subtotal", value: invoiceData.subtotal.toFixed(2) },
      { label: `Tax (${invoiceData.vatRate || "0"}%)`, value: invoiceData.tax.toFixed(2) }
    ];

    totalsData.forEach(({label, value}) => {
      page.drawText(label, {x: totalsLabelX, y, font: font, size: 11, color: colors.secondary });
      const valueWidth = font.widthOfTextAtSize(value, 11);
      page.drawText(value, {x: totalsAmountX - valueWidth, y, font: font, size: 11, color: colors.text });
      y -= 20;
    });
    
    y -= 5;
    page.drawLine({ start: { x: totalsX, y }, end: { x: width - margin, y: y }, thickness: 1, color: colors.borderColor });
    y -= 15;

    // Amount Due
    const totalValue = invoiceData.total.toFixed(2);
    page.drawText("Amount Due", {x: totalsLabelX, y, font: fontBold, size: 14, color: colors.accent });
    const totalValueWidth = fontBold.widthOfTextAtSize(totalValue, 14);
    page.drawText(totalValue, {x: totalsAmountX - totalValueWidth, y, font: fontBold, size: 14, color: colors.accent });
    y -= 40;

    // --- Footer ---
    page.drawText(`Thank you for your business. Payment is due within 14 days.`, {
      x: margin,
      y,
      font: font,
      size: 9,
      color: colors.secondary
    });


    // Finalize the PDF with PDF/A-3b compliance and ZUGFeRD embedding
    const finalPdfBuffer = await finalizePdf(pdfDoc, invoiceData);

    console.log("✅ Professional PDF/A-3b generation complete.");
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

