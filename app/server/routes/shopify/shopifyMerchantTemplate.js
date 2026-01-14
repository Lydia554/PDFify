const axios = require("axios");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const { finalizePdf } = require("../../Helpers/pdf-helpers");

/**
 * Formats a number as a currency string.
 * @param {number} amount - The amount to format.
 * @param {string} currency - The currency code (e.g., "USD", "EUR").
 * @param {string} locale - The locale string (e.g., "en-US", "de-DE").
 * @returns {string} The formatted currency string.
 */
function formatPrice(amount, currency = "EUR", locale = "en-US") {
  if (typeof amount !== 'number') {
    amount = parseFloat(amount);
  }
  if (isNaN(amount)) {
    return ""; // Or throw an error, depending on desired behavior for invalid input
  }
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
}

/**
 * Convert image URL (PNG, JPG, or SVG) to Buffer for embedding in PDF
 * @param {string} url 
 * @returns {Promise<Buffer>}
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
function mapOrderToPdfData(order, shopConfig = {}, user = {}) {
  const shopDomain = user?.connectedShopDomain;
  const prettyShopName = shopDomain ? shopDomain.split('.')[0].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : "Your Shop";
  
  const items = (order.line_items || []).map((item, index) => {
    const price = parseFloat(item.price || 0);
    const quantity = parseFloat(item.quantity || 1);
    const tax = (item.tax_lines || []).reduce((sum, t) => sum + parseFloat(t.price || 0), 0);
    const net = price * quantity;
    const total = net + tax;
    const currency = order.currency || "EUR";
    const locale = shopConfig.locale || "en-US"; // Use shopConfig locale or default

    return {
      position: index + 1,
      name: item.title || item.name || "Item",
      quantity,
      unitCode: "EA",
      price,
      formattedPrice: formatPrice(price, currency, locale),
      net,
      formattedNet: formatPrice(net, currency, locale),
      tax,
      formattedTax: formatPrice(tax, currency, locale),
      total,
      formattedTotal: formatPrice(total, currency, locale),
      taxRate: 21,
      currency,
    };
  });

  const subtotal = items.reduce((sum, i) => sum + i.net, 0);
  const taxTotal = items.reduce((sum, i) => sum + i.tax, 0);
  const total = subtotal + taxTotal;
  const currency = order.currency || "EUR";
  const locale = shopConfig.locale || "en-US";

  return {
    orderId: order.name || order.id,
    date: order.created_at ? new Date(order.created_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    customerName: `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim() || "Valued Customer",
    customerEmail: order.customer?.email,
    customerAddress: order.shipping_address ? 
                      `${order.shipping_address.address1}, ${order.shipping_address.city}, ${order.shipping_address.zip || ''}, ${order.shipping_address.country}` : 
                      (order.billing_address ? 
                        `${order.billing_address.address1}, ${order.billing_address.city}, ${order.billing_address.zip || ''}, ${order.billing_address.country}` : 
                        "Customer Address Not Available"),
    items,
    subtotal,
    formattedSubtotal: formatPrice(subtotal, currency, locale),
    tax: taxTotal,
    formattedTaxTotal: formatPrice(taxTotal, currency, locale),
    total,
    formattedTotal: formatPrice(total, currency, locale),
    vatRate: 21,
    currency,
    iban: shopConfig.iban || "DE89370400440532013000",
    bic: shopConfig.bic || "COBADEFFXXX",
    paymentTerms: order.payment?.terms || "Due within 14 days",
    creator: "PDFify",
    companyName: shopConfig.companyName || prettyShopName,
    shopName: shopConfig.shopName || prettyShopName,
    shopAddress: shopConfig.shopAddress || "123 Main St, Anytown, Country", // Placeholder address
    locale: { language: order.locale || "en", format: locale }, // Pass locale format for currency
  };
}

// ---------------------
// Create Merchant PDF (using pdf-lib)
// ---------------------

async function createMerchantPdf(invoiceData) {
  console.log(" Starting professional PDF-LIB generation (merchant invoice)...");

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
    const margin = 50; // Increased margin for better visual balance

    let y = height - margin; // Current Y position for drawing

    // --- Define Colors ---
    const colors = {
      primary: rgb(0.05, 0.11, 0.16),   // Deep Navy Blue
      secondary: rgb(0.25, 0.35, 0.47), // Shadow Blue
      accent: rgb(0.11, 0.60, 0.55),    // Muted Teal
      text: rgb(0.20, 0.23, 0.25),      // Charcoal
      lightGray: rgb(0.97, 0.98, 0.98), // Very light gray for zebra stripes
      borderColor: rgb(0.87, 0.89, 0.90),// Light gray for borders
      white: rgb(1, 1, 1),
    };

    // --- Invoice Header ---
    const headerStartY = y;

    // Draw Logo (if available)
    if (invoiceData.logoData) {
      try {
        const logoImage = await pdfDoc.embedPng(invoiceData.logoData);
        const logoDims = logoImage.scaleToFit(150, 60); // Max 150px wide, 60px high
        page.drawImage(logoImage, {
          x: margin,
          y: y - logoDims.height,
          width: logoDims.width,
          height: logoDims.height,
        });
      } catch (imgErr) {
        console.error("❌ Failed to embed logo image:", imgErr);
        // Fallback to drawing company name if logo fails
        page.drawText(invoiceData.shopName || invoiceData.companyName, {
          x: margin,
          y: y - 20, // Adjust Y for text
          font: fontBold,
          size: 16,
          color: colors.primary,
        });
      }
    } else {
      page.drawText(invoiceData.shopName || invoiceData.companyName, {
        x: margin,
        y: y - 20, // Adjust Y for text
        font: fontBold,
        size: 16,
        color: colors.primary,
      });
    }

    // Invoice Title and Meta (right-aligned)
    const titleX = width - margin;
    const titleWidth = fontBold.widthOfTextAtSize("INVOICE", 28);
    page.drawText("INVOICE", {
      x: titleX - titleWidth,
      y: headerStartY,
      font: fontBold,
      size: 28,
      color: colors.primary,
    });
    
    y = headerStartY - 30; // Move Y down for meta info
    const orderIdText = `Invoice #: ${invoiceData.orderId || ""}`;
    const orderIdWidth = font.widthOfTextAtSize(orderIdText, 10);
    page.drawText(orderIdText, {
      x: titleX - orderIdWidth,
      y: y,
      font: font,
      size: 10,
      color: colors.secondary,
    });
    y -= 15;
    const dateText = `Date: ${invoiceData.date || ""}`;
    const dateWidth = font.widthOfTextAtSize(dateText, 10);
    page.drawText(dateText, {
      x: titleX - dateWidth,
      y: y,
      font: font,
      size: 10,
      color: colors.secondary,
    });
    
    y = headerStartY - 100; // Position below header for line

    // Header Separator Line
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y: y },
      thickness: 2,
      color: colors.primary,
    });
    y -= 30;

    // --- Parties Section (Two Columns) ---
    const partyColWidth = (width - margin * 2) / 2;
    const partyLabelSize = 12;
    const partyTextSize = 10;
    const partyLineHeight = 15;
    const partiesTop = y; // Y position for the top of this section

    // "From" (Seller)
    page.drawText("From", { x: margin, y, font: fontBold, size: partyLabelSize, color: colors.secondary });
    y -= partyLineHeight;
    page.drawText(invoiceData.shopName || invoiceData.companyName, { x: margin, y, font: fontBold, size: partyTextSize, color: colors.text });
    y -= partyLineHeight;
    page.drawText(invoiceData.shopAddress, { x: margin, y, font: font, size: partyTextSize, color: colors.text });
    y -= partyLineHeight; // Spacer for next line

    let tempY = y; // Store Y position for "To" side alignment

    // "To" (Customer)
    y = partiesTop; // Reset y for "To" column
    const toColX = margin + partyColWidth;
    page.drawText("To", { x: toColX, y, font: fontBold, size: partyLabelSize, color: colors.secondary });
    y -= partyLineHeight;
    page.drawText(invoiceData.customerName, { x: toColX, y, font: fontBold, size: partyTextSize, color: colors.text });
    y -= partyLineHeight;
    page.drawText(invoiceData.customerAddress, { x: toColX, y, font: font, size: partyTextSize, color: colors.text });
    y -= partyLineHeight;
    if (invoiceData.customerEmail) {
      page.drawText(invoiceData.customerEmail, { x: toColX, y, font: font, size: partyTextSize, color: colors.text });
    }
    
    y = Math.min(tempY, y) - 40; // Ensure Y is below both columns and add extra space

    // --- Table Header ---
    const tableHeaderY = y;
    const itemColWidth = 200;
    const qtyColWidth = 60;
    const priceColWidth = 80;
    const totalColWidth = 100;
    const tableX = margin;
    
    const colPositions = [
        tableX, // Item
        tableX + itemColWidth + 10, // Quantity (approx)
        tableX + itemColWidth + qtyColWidth + 20, // Price (approx)
        width - margin - totalColWidth // Total (right aligned)
    ];

    page.drawRectangle({
      x: margin,
      y: tableHeaderY - 18,
      width: width - margin * 2,
      height: 22,
      color: colors.primary,
    });
    
    page.drawText("Item", { x: colPositions[0] + 5, y: tableHeaderY - 15, font: fontBold, size: 10, color: colors.white });
    page.drawText("Qty", { x: colPositions[1], y: tableHeaderY - 15, font: fontBold, size: 10, color: colors.white });
    page.drawText("Price", { x: colPositions[2], y: tableHeaderY - 15, font: fontBold, size: 10, color: colors.white });
    page.drawText("Total", { x: colPositions[3], y: tableHeaderY - 15, font: fontBold, size: 10, color: colors.white });
    y -= 30;

    // --- Table Rows ---
    (invoiceData.items || []).forEach((item, index) => {
      const rowY = y;
      const rowHeight = 25; // Standard row height

      // Zebra stripe
      if (index % 2 !== 0) {
        page.drawRectangle({
          x: margin,
          y: rowY - rowHeight + 5, // Adjust to cover the row
          width: width - margin * 2,
          height: rowHeight,
          color: colors.lightGray,
        });
      }

      // Draw text for each cell (using formatted strings)
      page.drawText(item.name || "", { x: colPositions[0] + 5, y: rowY - 10, font: font, size: 9, color: colors.text });
      
      const qtyText = String(item.quantity);
      const qtyTextWidth = font.widthOfTextAtSize(qtyText, 9);
      page.drawText(qtyText, { x: colPositions[1] + qtyColWidth - qtyTextWidth - 5, y: rowY - 10, font: font, size: 9, color: colors.text });
      
      const priceText = item.formattedPrice;
      const priceTextWidth = font.widthOfTextAtSize(priceText, 9);
      page.drawText(priceText, { x: colPositions[2] + priceColWidth - priceTextWidth - 5, y: rowY - 10, font: font, size: 9, color: colors.text });

      const totalText = item.formattedTotal;
      const totalTextWidth = font.widthOfTextAtSize(totalText, 9);
      page.drawText(totalText, { x: colPositions[3] + totalColWidth - totalTextWidth - 5, y: rowY - 10, font: font, size: 9, color: colors.text });

      y -= rowHeight;
    });

    // Vertical spacing before totals
    y -= 20;

    // --- Totals Section ---
    const totalsTableWidth = 250;
    const totalsLabelX = width - margin - totalsTableWidth;
    const totalsAmountX = width - margin;
    const totalsLineHeight = 18;

    page.drawLine({ start: { x: totalsLabelX, y }, end: { x: totalsAmountX, y: y }, thickness: 1, color: colors.borderColor });
    y -= 10;
    
    const totalsData = [
      { label: "Subtotal", value: invoiceData.formattedSubtotal },
      { label: `Tax (${invoiceData.vatRate || "0"}%)`, value: invoiceData.formattedTaxTotal }
    ];

    totalsData.forEach(({label, value}) => {
      page.drawText(label, {x: totalsLabelX, y, font: font, size: 10, color: colors.secondary });
      const valueWidth = font.widthOfTextAtSize(value, 10);
      page.drawText(value, {x: totalsAmountX - valueWidth, y, font: font, size: 10, color: colors.text });
      y -= totalsLineHeight;
    });
    
    y -= 8; // Extra space before total due box

    // Amount Due Box
    const amountDueBoxHeight = 25;
    page.drawRectangle({
      x: totalsLabelX,
      y: y - amountDueBoxHeight + 5,
      width: totalsTableWidth,
      height: amountDueBoxHeight,
      color: colors.accent,
    });

    const amountDueLabel = "Amount Due:";
    const amountDueLabelWidth = fontBold.widthOfTextAtSize(amountDueLabel, 12);
    page.drawText(amountDueLabel, {x: totalsLabelX + 10, y: y - 10, font: fontBold, size: 12, color: colors.white });
    
    const totalValue = invoiceData.formattedTotal;
    const totalValueWidth = fontBold.widthOfTextAtSize(totalValue, 12);
    page.drawText(totalValue, {x: totalsAmountX - totalValueWidth - 10, y: y - 10, font: fontBold, size: 12, color: colors.white });
    y -= amountDueBoxHeight + 10;

    // --- Footer ---
    const footerStartY = margin + 60;
    const footerText = `Thank you for your business! For questions, please contact ${invoiceData.shopName || "our team"} at ${invoiceData.customerEmail || invoiceData.companyName}. Payment is due within ${invoiceData.paymentTerms}.`;
    
    // Draw text from the bottom up to avoid overlap
    page.drawText(footerText, {
      x: margin,
      y: footerStartY,
      font: font,
      size: 9,
      color: colors.secondary,
      maxWidth: width - margin * 2,
      lineHeight: 12, // Explicit line height
    });

    const copyrightText = `© 2025 ${invoiceData.shopName || invoiceData.companyName}. All rights reserved.`;
    const copyrightWidth = font.widthOfTextAtSize(copyrightText, 8);
    page.drawText(copyrightText, {
      x: width / 2 - copyrightWidth / 2, // Centered
      y: margin - 20, // Bottom of the page
      font: font,
      size: 8,
      color: colors.borderColor,
    });


    // Finalize the PDF with PDF/A-3b compliance and ZUGFeRD embedding
    const finalPdfBuffer = await finalizePdf(pdfDoc, invoiceData);

    console.log("✅ Professional PDF/A-3b generation complete.");
    return finalPdfBuffer;
    
  } catch (err) {_
    console.error("❌ createMerchantPdf failed:", err);
    throw err;
  }
}

module.exports = {
  mapOrderToPdfData,
  createMerchantPdf, 
  getBase64Image
};

