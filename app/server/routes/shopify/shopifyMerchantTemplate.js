const axios = require("axios");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const { createPdfA3WithJava } = require("../../Helpers/pdf-helpers");

/**
 * Formats a number as a currency string.
 * @param {number} amount - The amount to format.
 * @param {string} currency - The currency code (e.e., "USD", "EUR").
 * @param {string} locale - The locale string (e.e., "en-US", "de-DE").
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
// Create Merchant PDF (using PDFKit)
// ---------------------

async function createMerchantPdf(invoiceData) {
  console.log("🧾 Generating merchant PDF via Java service...");

  try {
    // Call Java PDF/A-3B service
    const filename = `Invoice_${invoiceData.orderId}_${Date.now()}.pdf`;
    const pdfBuffer = await createPdfA3WithJava(invoiceData, filename);

    console.log("✅ Java service PDF generation complete.");
    return pdfBuffer;

  } catch (err) {
    console.error("❌ createMerchantPdf failed:", err);
    throw err;
  }
}

module.exports = {
  mapOrderToPdfData,
  createMerchantPdf, 
  getBase64Image
};

