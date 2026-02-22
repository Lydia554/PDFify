const express = require("express");
const axios = require("axios");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const crypto = require("crypto");

const ShopConfig = require("../../models/ShopConfig");
const User = require("../../models/User");
const authenticate = require("../../middleware/authenticate");
const dualAuth = require("../../middleware/dualAuth");
const { resolveShopifyToken, getShopLogoUrl } = require("./shopifyHelpers");
const { resolveLanguage } = require("../../utils/resolveLanguage");
const { incrementUsage } = require("../../utils/usageUtils");
const { generateCustomerInvoiceHTML, formatPrice: customerFormatPrice } = require("./customerInvoice");
const { createPdfA3WithJava } = require("../../Helpers/pdf-helpers");
const generateZugferdXml = require("../../../xml/generateZugferdXml");

const locales = {
  sl: require("../../../locales/sl.json"),
  en: require("../../../locales/en.json"),
  de: require("../../../locales/de.json"),
};

const os = require("os");
const JSZip = require("jszip");

const router = express.Router();

require('dotenv').config();

// ----------------------------
// Helper Functions
// ----------------------------

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
    return "";
  }
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
}

/**
 * Convert image URL (PNG, JPG, or SVG) to base64 string for embedding in PDF
 * @param {string} url
 * @returns {Promise<string>} Base64 encoded PNG image or empty string
 */
async function getBase64Image(url) {
  if (!url) return '';
  try {
    console.log("🔍 Fetching logo for merchant invoice:", url);
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 10000,
      validateStatus: (status) => status === 200
    });

    // Validate we received image data
    const buffer = Buffer.from(response.data);
    if (buffer.length === 0) {
      console.error("❌ Logo fetch returned empty buffer");
      return '';
    }

    // Use sharp to ensure it's a PNG, converting SVG if necessary
    const imageBuffer = await sharp(buffer).png().toBuffer();

    // Validate the PNG conversion worked
    if (!imageBuffer || imageBuffer.length < 8) {
      console.error("❌ Logo PNG conversion failed or produced invalid data");
      return '';
    }

    // Verify PNG signature
    if (imageBuffer[0] !== 0x89 || imageBuffer[1] !== 0x50 ||
        imageBuffer[2] !== 0x4E || imageBuffer[3] !== 0x47) {
      console.error("❌ Logo data does not have valid PNG signature");
      return '';
    }

    // Convert to base64 string
    const base64 = imageBuffer.toString('base64');

    console.log("✅ Logo processed successfully, size:", imageBuffer.length, "bytes");
    return base64;
  } catch (err) {
    console.error("❌ Error fetching or processing logo:", url, err.message);
    return '';
  }
}

/**
 * Map Shopify order → PDF data for Java service
 * @param {object} order - Shopify order object
 * @param {object} shopConfig - Shop configuration
 * @param {object} user - User object
 * @returns {object} Invoice data for Java service
 */
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
    const locale = shopConfig.locale || "en-US";

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
    bankName: shopConfig.bankName || "",
    paymentTerms: order.payment?.terms || "Due within 14 days",
    creator: "PDFify",
    companyName: shopConfig.companyName || prettyShopName,
    shopName: shopConfig.shopName || prettyShopName,
    shopAddress: shopConfig.shopAddress || "123 Main St, Anytown, Country",
    primaryColor: shopConfig.primaryColor || "#00a6cc", // Custom color from shop config
    locale: { language: order.locale || "en", format: locale },
  };
}

// ----------------------------
// Helper functions for invoice generation
// ----------------------------

/**
 * Generate invoice using Java service (PDF/A-3b + ZUGFeRD)
 */
async function generateJavaInvoice(invoiceData, shopDomain, order) {
  const shopConfig = await ShopConfig.findOne({ shopDomain: shopDomain }) || {};

  // Add ZUGFeRD XML for paying customers
  const user = await User.findOne({ connectedShopDomain: shopDomain });
  const isPayingCustomer = user && (user.plan === "pro" || user.plan === "premium");

  if (isPayingCustomer) {
    try {
      console.log(`🧾 [Shopify] Generating ZUGFeRD XML for ${user.plan} user...`);
      const zugferdData = {
        orderId: invoiceData.orderId,
        date: invoiceData.date,
        currency: invoiceData.currency,
        customerName: invoiceData.customerName,
        companyName: invoiceData.companyName,
        iban: invoiceData.iban,
        items: invoiceData.items,
        subtotal: invoiceData.subtotal,
        tax: invoiceData.tax,
        total: invoiceData.total,
        sellerAddress: {
          postCode: "12345",
          street: invoiceData.shopAddress || "Main Street 1",
          city: "Anytown",
          country: "DE"
        },
        buyerAddress: {
          postCode: "12345",
          street: invoiceData.customerAddress?.split(',')[0] || "Customer Street 1",
          city: invoiceData.customerAddress?.split(',')[1] || "Customerton",
          country: invoiceData.customerAddress?.split(',')[3] || "DE"
        },
        sellerVatId: "DE123456789",
        vatRate: invoiceData.vatRate || 21
      };
      invoiceData.zugferdXml = generateZugferdXml(zugferdData);
      console.log("🧾 [Shopify] ZUGFeRD XML generated:", invoiceData.zugferdXml.length, "bytes");
    } catch (zugferdErr) {
      console.error("🧾 [Shopify] Failed to generate ZUGFeRD XML:", zugferdErr.message);
    }
  }

  // Try to fetch logo from Shopify
  try {
    const user = await User.findOne({ connectedShopDomain: shopDomain });
    const token = user?.shopifyAccessToken || shopConfig.shopifyAccessToken;
    if (token) {
      const logoUrl = await getShopLogoUrl(shopDomain, token);
      if (logoUrl) {
        const logoBase64 = await getBase64Image(logoUrl);
        if (logoBase64 && logoBase64.length > 0) {
          invoiceData.logoData = logoBase64;
        }
      }
    }
  } catch (logoErr) {
    console.warn("Failed to fetch logo:", logoErr.message);
  }

  const filename = `Invoice_${invoiceData.orderId}_${Date.now()}.pdf`;
  return await createPdfA3WithJava(invoiceData, filename);
}

/**
 * Generate invoice using Puppeteer (HTML to PDF)
 */
async function generatePuppeteerInvoice(invoiceData, order, shopDomain) {
  const shopConfig = await ShopConfig.findOne({ shopDomain: shopDomain }) || {};
  const lang = invoiceData.locale?.language || "en";
  const locale = locales[lang] || locales["en"];

  // Build HTML data
  const htmlData = {
    ...invoiceData,
    items: invoiceData.items.map(i => ({
      ...i,
      formattedPrice: formatPrice(i.price, invoiceData.currency || "EUR", lang),
      formattedNet: formatPrice(i.net, invoiceData.currency || "EUR", lang),
      formattedTax: formatPrice(i.tax, invoiceData.currency || "EUR", lang),
      formattedTotal: formatPrice(i.total, invoiceData.currency || "EUR", lang),
    })),
    formattedSubtotal: formatPrice(invoiceData.subtotal, invoiceData.currency || "EUR", lang),
    formattedTaxTotal: formatPrice(invoiceData.tax, invoiceData.currency || "EUR", lang),
    formattedTotal: formatPrice(invoiceData.total, invoiceData.currency || "EUR", lang),
    shopName: shopConfig.shopName || shopDomain,
    currency: invoiceData.currency || "EUR",
    locale: lang,
    customLogoUrl: "",
  };

  const html = generateCustomerInvoiceHTML(htmlData, true, lang, locale);

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load", timeout: 15000 });
  await page.evaluateHandle("document.fonts.ready");

  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "40px", bottom: "40px", left: "40px", right: "40px" },
    preferCSSPageSize: true,
    displayHeaderFooter: false,
    pdfVersion: "1.4",
  });

  await browser.close();
  return pdfBuffer;
}

// ----------------------------
// Generate invoice PDF
// ----------------------------
router.post("/invoice", authenticate, dualAuth, async (req, res) => {
  try {
    const shopDomain = req.body.shopDomain || req.headers["x-shopify-shop-domain"];
    if (!shopDomain) return res.status(400).json({ error: "Missing shop domain" });

    let orderId = req.body.orderId;
    let order = req.body.order || null;
    let token;

    // Fetch Shopify order if not provided
    if (!order && orderId) {
      token = await resolveShopifyToken(req, shopDomain);
      if (!token) return res.status(400).json({ error: "Missing Shopify access token" });

      if (typeof orderId === "string" && orderId.startsWith("gid://")) {
        orderId = orderId.split("/").pop();
      }

      const resp = await axios.get(`https://${shopDomain}/admin/api/2023-10/orders/${orderId}.json`, {
        headers: { "X-Shopify-Access-Token": token },
      });
      order = resp.data.order;
    }

    if (!order || !order.line_items) {
      return res.status(400).json({ error: "Invalid or missing order data" });
    }

    const shopConfig = (await ShopConfig.findOne({ shopDomain })) || {};
    const { lang } = await resolveLanguage({ req, order, shopDomain, shopConfig });

    const user = req.user?.userId
      ? await User.findById(req.user.userId)
      : await User.findOne({ connectedShopDomain: shopDomain });
    if (!user) return res.status(404).json({ error: "User not found" });

    const isPreview = req.query.preview === "true";
    const isMerchant = req.query.merchant === "true";

    // Map order items
    const items = (order.line_items || []).map((item) => {
      const quantity = parseFloat(item.quantity || 1);
      const price = parseFloat(item.price || 0);
      const net = price * quantity;
      const tax = (item.tax_lines || []).reduce((sum, t) => sum + parseFloat(t.price || 0), 0);
      const total = net + tax;
      return { name: item.title || item.name || "Item", quantity, price, net, tax, total, taxRate: 21 };
    });

    const subtotal = items.reduce((sum, i) => sum + i.net, 0);
    const taxTotal = items.reduce((sum, i) => sum + i.tax, 0);
    const total = subtotal + taxTotal;

    const invoiceData = {
      orderId: order.name || order.id,
      date: order.created_at ? new Date(order.created_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      items,
      subtotal,
      tax: taxTotal,
      total,
      vatRate: 21,
      customerName: `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim() || "Valued Customer",
      iban: shopConfig.iban || "DE89370400440532013000",
      bic: shopConfig.bic || "COBADEFFXXX",
      paymentTerms: order.payment?.terms || "Due within 14 days",
      creator: "PDFify",
      locale: { language: lang || "en" },
    };

    let pdfBuffer;


if (isMerchant) {
try {
  console.log("🧾 [Shopify] Generating merchant PDF for:", order?.id || order?.name);
  console.log("🧾 [Shopify] Order name:", order?.name, "Order ID:", order?.id);
  console.log("🧾 [Shopify] Customer:", order?.customer?.first_name, order?.customer?.last_name);
  console.log("🧾 [Shopify] Line items:", order?.line_items?.length);

  const invoiceData = mapOrderToPdfData(order, shopConfig, user);

  console.log("🧾 [Shopify] Mapped invoiceData - orderId:", invoiceData.orderId);
  console.log("🧾 [Shopify] Mapped invoiceData - customerName:", invoiceData.customerName);
  console.log("🧾 [Shopify] Mapped invoiceData - items:", invoiceData.items?.length);
  console.log("🧾 [Shopify] Mapped invoiceData - total:", invoiceData.total);

  // Generate ZUGFeRD XML for paying customers (premium + pro)
  const isPayingCustomer = user && (user.planType === "pro" || user.planType === "premium");

  if (isPayingCustomer) {
    try {
      console.log(`🧾 [Shopify] Generating ZUGFeRD XML for ${user.planType} user...`);
      const zugferdData = {
        orderId: invoiceData.orderId,
        date: invoiceData.date,
        currency: invoiceData.currency,
        customerName: invoiceData.customerName,
        companyName: invoiceData.companyName,
        iban: invoiceData.iban,
        items: invoiceData.items,
        subtotal: invoiceData.subtotal,
        tax: invoiceData.tax,
        total: invoiceData.total,
        sellerAddress: {
          postCode: "12345", // Should come from shopConfig
          street: invoiceData.shopAddress || "Main Street 1",
          city: "Anytown",
          country: "DE"
        },
        buyerAddress: {
          postCode: "12345",
          street: invoiceData.customerAddress?.split(',')[0] || "Customer Street 1",
          city: invoiceData.customerAddress?.split(',')[1] || "Customerton",
          country: invoiceData.customerAddress?.split(',')[3] || "DE"
        },
        sellerVatId: "DE123456789", // Should come from shopConfig
        vatRate: invoiceData.vatRate || 21
      };
      invoiceData.zugferdXml = generateZugferdXml(zugferdData);
      console.log("🧾 [Shopify] ZUGFeRD XML generated:", invoiceData.zugferdXml.length, "bytes");
    } catch (zugferdErr) {
      console.error("🧾 [Shopify] Failed to generate ZUGFeRD XML:", zugferdErr.message);
      // Continue without XML
    }
  } else {
    console.log("🧾 [Shopify] Skipping ZUGFeRD XML for free user");
  }

  // Fetch logo from Shopify directly
  if (!token) token = await resolveShopifyToken(req, shopDomain);
  const logoUrl = await getShopLogoUrl(shopDomain, token);
  if (logoUrl) {
      console.log(`[Shopify Merchant Invoice] Fetched logo URL from Shopify: ${logoUrl}`);
      const logoBase64 = await getBase64Image(logoUrl);
      // Only add logoData if it was successfully fetched and is valid
      if (logoBase64 && logoBase64.length > 0) {
          invoiceData.logoData = logoBase64;
          console.log(`[Shopify Merchant Invoice] Logo added to invoice (${logoBase64.length} bytes base64)`);
      } else {
          console.log(`[Shopify Merchant Invoice] Logo fetch returned empty data, skipping logo`);
          delete invoiceData.logoData;
      }
  } else {
      console.log(`[Shopify Merchant Invoice] Could not fetch logo URL from Shopify.`);
  }

  const filename = `Invoice_${invoiceData.orderId}_${Date.now()}.pdf`;
  pdfBuffer = await createPdfA3WithJava(invoiceData, filename);
  console.log(`📄 Merchant PDF generated, size: ${pdfBuffer.length} bytes`);

  const safeOrderId = (invoiceData.orderId || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename=Invoice-${safeOrderId}.pdf`,
  });
  return res.send(pdfBuffer);
} catch (err) {
  console.error("❌ Merchant PDF generation failed:", err);
  return res.status(500).json({ error: "Merchant PDF generation failed", details: err.message });
}

}

    // ----------------------------
    // Customer PDF (Puppeteer HTML → PDF)
    // ----------------------------
    console.log("🧾 [Customer Invoice] Starting PDF generation...");
    console.log("🧾 [Customer Invoice] allowCustomerPDF:", shopConfig.allowCustomerPDF);

    if (!shopConfig.allowCustomerPDF) {
      return res.status(403).json({ error: "Customer PDFs are not allowed by this merchant" });
    }

    console.log("🧾 [Customer Invoice] Building htmlData...");

    // Fetch and optimize logo if present
    let optimizedLogoUrl = shopConfig.customLogoUrl || "";
    if (optimizedLogoUrl && optimizedLogoUrl.trim() !== "") {
      try {
        console.log("🧾 [Customer Invoice] Fetching logo:", optimizedLogoUrl.substring(0, 60) + "...");
        const logoResponse = await axios.get(optimizedLogoUrl, {
          responseType: "arraybuffer",
          timeout: 5000,
          validateStatus: (status) => status === 200
        });

        // Resize and optimize logo
        const logoBuffer = await sharp(logoResponse.data)
          .resize({ width: 180, height: 80, fit: "inside", withoutEnlargement: true })
          .png()
          .toBuffer();

        optimizedLogoUrl = `data:image/png;base64,${logoBuffer.toString("base64")}`;
        console.log("🧾 [Customer Invoice] Logo optimized, size:", logoBuffer.length, "bytes");
      } catch (logoErr) {
        console.warn("🧾 [Customer Invoice] Logo fetch/optimization failed:", logoErr.message);
        optimizedLogoUrl = "";
      }
    }

    const htmlData = {
      ...invoiceData,
      items: items.map(i => ({
        ...i,
        formattedPrice: formatPrice(i.price, order.currency || "EUR", lang || "en"),
        formattedNet: formatPrice(i.net, order.currency || "EUR", lang || "en"),
        formattedTax: formatPrice(i.tax, order.currency || "EUR", lang || "en"),
        formattedTotal: formatPrice(i.total, order.currency || "EUR", lang || "en"),
      })),
      formattedSubtotal: formatPrice(subtotal, order.currency || "EUR", lang || "en"),
      formattedTaxTotal: formatPrice(taxTotal, order.currency || "EUR", lang || "en"),
      formattedTotal: formatPrice(total, order.currency || "EUR", lang || "en"),
      shopName: shopConfig.shopName || shopDomain,
      currency: order.currency || "EUR",
      locale: lang || "en",
      customLogoUrl: optimizedLogoUrl,
    };

    console.log("🧾 [Customer Invoice] htmlData built:", {
      shopName: htmlData.shopName,
      customerName: htmlData.customerName,
      itemCount: htmlData.items?.length,
      hasLogo: !!htmlData.customLogoUrl,
      logoIsDataUrl: htmlData.customLogoUrl?.startsWith("data:")
    });

    console.log("🧾 [Customer Invoice] Launching Puppeteer...");
    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();

    console.log("🧾 [Customer Invoice] Loading locale:", lang);
    const locale = locales[lang] || locales["en"];
    console.log("🧾 [Customer Invoice] Locale loaded, keys:", Object.keys(locale).length);

    console.log("🧾 [Customer Invoice] Generating HTML...");
    const html = generateCustomerInvoiceHTML(htmlData, true, lang, locale);
    console.log("🧾 [Customer Invoice] HTML generated, length:", html.length, "chars");

    console.log("🧾 [Customer Invoice] Setting page content...");
    await page.setContent(html, { waitUntil: "load", timeout: 15000 });
    console.log("🧾 [Customer Invoice] Page content set, waiting for fonts...");
    await page.evaluateHandle("document.fonts.ready");
    console.log("🧾 [Customer Invoice] Fonts ready, generating PDF...");

    // Generate PDF directly from Puppeteer with PDF/A-1b compatibility
    pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "40px", bottom: "40px", left: "40px", right: "40px" },
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      pdfVersion: "1.4",  // More compatible PDF version
    });

    console.log("🧾 [Customer Invoice] PDF generated successfully, size:", pdfBuffer.length, "bytes");
    console.log("🧾 [Customer Invoice] Closing browser...");
    await browser.close();
    await incrementUsage(user, 1, isPreview);

    console.log("🧾 [Customer Invoice] Sending response, size:", pdfBuffer.length, "bytes");
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": isPreview ? "inline" : `attachment; filename=${invoiceData.orderId}.pdf`,
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "X-Content-Type-Options": "nosniff",
      "Pragma": "no-cache"
    });
    console.log("🧾 [Customer Invoice] Response headers set, sending buffer...");
    res.send(pdfBuffer);
    console.log("🧾 [Customer Invoice] Response sent successfully!");

  } catch (err) {
    console.error("❌ [Customer Invoice] ERROR:", err.message);
    console.error("❌ [Customer Invoice] Stack trace:", err.stack);
    console.error("❌ [Customer Invoice] Error details:", {
      name: err.name,
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: "PDF generation failed", details: err.message });
  }
});




router.get("/connection", authenticate, dualAuth, async (req, res) => {

  try {
    const connectedShopDomain = req.fullUser.connectedShopDomain || null;
    res.json({ connectedShopDomain });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch Shopify connection" });
  }
});




router.post("/connect", authenticate, dualAuth, async (req, res) => {
  try {
    const { shopDomain, accessToken } = req.body;

    if (!shopDomain || !accessToken) {
      return res.status(400).json({ error: "Shop domain and access token required" });
    }

    const normalizedShopDomain = shopDomain.toLowerCase();


    req.fullUser.connectedShopDomain = normalizedShopDomain;
    req.fullUser.shopifyAccessToken = accessToken;
    await req.fullUser.save();

    res.json({ message: `Shopify store ${normalizedShopDomain} connected successfully.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to connect Shopify store" });
  }
});

router.post("/disconnect", authenticate, dualAuth, async (req, res) => {
  try {
    req.fullUser.connectedShopDomain = null;
    req.fullUser.shopifyAccessToken = null;
    await req.fullUser.save();
    res.json({ message: "Shopify store disconnected successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to disconnect Shopify store" });
  }
});



router.get("/config", async (req, res) => {
  const { shopDomain } = req.query;
  if (!shopDomain) return res.status(400).json({ error: "Missing shopDomain" });

  try {
    const normalizedShop = shopDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    const shopConfig = await ShopConfig.findOne({ shopDomain: normalizedShop });

    if (!shopConfig) {
      return res.status(404).json({ error: "Shop not found" });
    }

    res.json({
      allowCustomerPDF: shopConfig.allowCustomerPDF || false,
      primaryColor: shopConfig.primaryColor || "#00a6cc",
      companyName: shopConfig.companyName || "",
      iban: shopConfig.iban || "",
      bic: shopConfig.bic || "",
      bankName: shopConfig.bankName || ""
    });
  } catch (err) {
    console.error("Failed to fetch Shopify config:", err);
    res.status(500).json({ error: "Failed to fetch config" });
  }
});



router.post("/settings", async (req, res) => {
  const { shopDomain, allowCustomerPDF } = req.body;
  if (!shopDomain) return res.status(400).json({ error: "Missing shopDomain" });

  try {
  const normalizedShopDomain = shopDomain.trim().toLowerCase();
const shopConfig = await ShopConfig.findOneAndUpdate(
  { shopDomain: normalizedShopDomain },
  { allowCustomerPDF },
  { upsert: true, new: true }
);

    res.json({ message: "Settings saved", allowCustomerPDF: shopConfig.allowCustomerPDF });
  } catch (err) {
    console.error("Failed to save Shopify settings:", err);
    res.status(500).json({ error: "Failed to save settings" });
  }
});


router.get("/orders", authenticate, dualAuth, async (req, res) => {
  const shopDomain = req.query.shopDomain;
  if (!shopDomain) return res.status(400).json({ error: "Missing shopDomain" });

  const fromDate = req.query.from; 
  const toDate = req.query.to;     

  try {
    const token = await resolveShopifyToken(req, shopDomain);
    if (!token) return res.status(400).json({ error: "Missing Shopify access token" });

    let shopifyOrdersUrl = `https://${shopDomain}/admin/api/2023-10/orders.json?limit=50&status=any&fields=id,name,created_at`;

    
    const params = [];
    if (fromDate) params.push(`created_at_min=${encodeURIComponent(fromDate + "T00:00:00Z")}`);
    if (toDate) params.push(`created_at_max=${encodeURIComponent(toDate + "T23:59:59Z")}`);
    if (params.length) shopifyOrdersUrl += `&${params.join("&")}`;

    const response = await axios.get(shopifyOrdersUrl, {
      headers: { "X-Shopify-Access-Token": token },
    });

    const orders = response.data.orders.map(o => ({
      id: o.id,
      name: o.name,
      date: new Date(o.created_at).toISOString().slice(0, 10),
    }));

    res.json({ orders });
  } catch (err) {
    console.error("❌ Failed to fetch orders:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

router.post("/invoices/zip", authenticate, dualAuth, async (req, res) => {
  try {
    const { shopDomain, from, to } = req.body;
    if (!shopDomain) return res.status(400).json({ error: "Missing shopDomain" });

    const token = await resolveShopifyToken(req, shopDomain);
    if (!token) return res.status(400).json({ error: "Missing Shopify access token" });

    // Fetch orders
    let shopifyOrdersUrl = `https://${shopDomain}/admin/api/2023-10/orders.json?limit=50&status=any&fields=id,name,created_at`;
    const params = [];
    if (from) params.push(`created_at_min=${encodeURIComponent(from + "T00:00:00Z")}`);
    if (to) params.push(`created_at_max=${encodeURIComponent(to + "T23:59:59Z")}`);
    if (params.length) shopifyOrdersUrl += `&${params.join("&")}`;

    const response = await axios.get(shopifyOrdersUrl, { headers: { "X-Shopify-Access-Token": token } });
    const orders = response.data.orders;
    if (!orders.length) return res.status(404).json({ error: "No orders found in this range" });

    const zip = new JSZip();
    const user = req.fullUser;

    // Process orders
    for (const order of orders) {
      let fullOrder = order;
      if (!fullOrder.line_items) {
        const fullOrderResp = await axios.get(
          `https://${shopDomain}/admin/api/2023-10/orders/${order.id}.json`,
          { headers: { "X-Shopify-Access-Token": token } }
        );
        fullOrder = fullOrderResp.data.order;
      }

      // 1️⃣ Generate PDF + XML
      const { pdfBuffer, xmlContent } = await createShopifyInvoiceZugferd(fullOrder, {}, "shopify");

      // 2️⃣ Safe filenames
      const safeOrderId = (fullOrder.name || fullOrder.id || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");

      // 3️⃣ Add to ZIP
      zip.file(`Invoice-${safeOrderId}.pdf`, pdfBuffer);
      zip.file(`ZUGFeRD-${safeOrderId}.xml`, xmlContent);
    }

    // Increment usage
    await incrementUsage(user, orders.length, false);

    // Generate ZIP buffer
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename=Invoices_${from || "start"}_to_${to || "end"}.zip`,
    });
    res.send(zipBuffer);

  } catch (err) {
    console.error("Failed to generate ZIP:", err);
    res.status(500).json({ error: "Failed to generate ZIP" });
  }
});

// ================================
// OAuth Routes for App Store Installation
// ================================

/**
 * OAuth Install - Entry point from Shopify App Store
 * GET /api/shopify/install?shop=store.myshopify.com
 */
router.get("/install", (req, res) => {
  const { shop } = req.query;

  // Validate shop parameter
  if (!shop) {
    return res.status(400).send("Missing shop parameter. Please use the link from Shopify App Store.");
  }

  // Normalize shop domain
  const normalizedShop = shop.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');

  if (!normalizedShop.endsWith('.myshopify.com') && !normalizedShop.endsWith('.myshopify.io')) {
    return res.status(400).send("Invalid shop domain. Must be a *.myshopify.com or *.myshopify.io domain.");
  }

  // Generate state parameter for security
  const state = crypto.randomBytes(16).toString("hex");

  // Build OAuth authorization URL
  const scopes = "read_orders,write_orders,read_products,read_themes,read_locations";
  const redirectUri = process.env.SHOPIFY_REDIRECT_URL || "https://pdfify.pro/shopify/callback";
  const clientId = process.env.SHOPIFY_CLIENT_ID;

  if (!clientId) {
    console.error("❌ SHOPIFY_CLIENT_ID not set in environment variables");
    return res.status(500).send("App configuration error. Please contact support.");
  }

  const installUrl = `https://${normalizedShop}/admin/oauth/authorize?` +
    `client_id=${clientId}&` +
    `scope=${encodeURIComponent(scopes)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `state=${state}&` +
    `response_type=code`;

  console.log(`🔗 Redirecting to Shopify OAuth for shop: ${normalizedShop}`);
  res.redirect(installUrl);
});

/**
 * OAuth Callback - Handles the callback after merchant approves the app
 * GET /api/shopify/callback?shop=...&code=...&hmac=...&state=...
 */
router.get("/callback", async (req, res) => {
  const { shop, code, hmac, state } = req.query;

  console.log("🔐 OAuth callback received:", { shop, hasCode: !!code, hasHmac: !!hmac });

  // Validate required parameters
  if (!shop || !code || !hmac) {
    console.error("❌ Missing OAuth parameters");
    return res.status(400).send("Missing required OAuth parameters");
  }

  const normalizedShop = shop.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');

  try {
    // Step 1: Verify HMAC signature for security
    const message = Object.keys(req.query)
      .filter(key => key !== 'hmac')
      .sort()
      .map(key => `${key}=${req.query[key]}`)
      .join('&');

    const expectedHmac = crypto
      .createHmac('sha256', process.env.SHOPIFY_CLIENT_SECRET)
      .update(message)
      .digest('hex');

    if (hmac !== expectedHmac) {
      console.error("❌ HMAC verification failed for shop:", normalizedShop);
      return res.status(400).send("Security verification failed. Please try again.");
    }

    console.log(`✅ HMAC verified for shop: ${normalizedShop}`);

    // Step 2: Exchange authorization code for access token
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

    console.log(`🔑 Exchanging code for access token...`);

    const tokenResponse = await axios.post(
      `https://${normalizedShop}/admin/oauth/access_token`,
      {
        client_id: clientId,
        client_secret: clientSecret,
        code: code
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    const { access_token } = tokenResponse.data;

    if (!access_token) {
      console.error("❌ No access token received from Shopify. Response:", tokenResponse.data);
      return res.status(500).send("Failed to obtain access token");
    }

    console.log(`✅ Access token received for shop: ${normalizedShop}, length: ${access_token.length}`);

    // Step 3: Save shop configuration with access token to database
    console.log(`💾 Saving shop config to database...`);

    const shopConfig = await ShopConfig.findOneAndUpdate(
      { shopDomain: normalizedShop },
      {
        shopDomain: normalizedShop,
        connectedAt: new Date(),
        isActive: true,
        shopifyAccessToken: access_token  // Store access token for embedded app
      },
      { upsert: true, new: true }
    );

    console.log(`✅ Shop config saved for: ${normalizedShop}`);
    console.log(`   - Has access token: ${!!shopConfig.shopifyAccessToken}`);
    console.log(`   - Token length: ${shopConfig.shopifyAccessToken?.length || 0}`);

    // Step 4: Also update existing user if one exists with this shop
    const existingUser = await User.findOne({ connectedShopDomain: normalizedShop });

    if (existingUser) {
      // Update existing user's access token
      existingUser.shopifyAccessToken = access_token;
      await existingUser.save();
      console.log(`✅ Updated existing user for shop: ${normalizedShop}`);
    } else {
      console.log(`ℹ️ New shop installation: ${normalizedShop} (no existing user, token stored in ShopConfig)`);
    }

    // Step 5: Redirect to the embedded app
    // The app will be loaded at: https://{shop}/admin/apps/pdfify-invoice-generator
    console.log(`🎉 Installation successful for: ${normalizedShop}, redirecting to embedded app`);

    res.redirect(`https://${normalizedShop}/admin/apps/pdfify-invoice-generator`);

  } catch (error) {
    console.error("❌ OAuth callback error:", error.response?.data || error.message);
    console.error("❌ Full error:", error);

    // Provide user-friendly error message
    const errorMessage = error.response?.data?.error || error.message;
    res.status(500).send(`
      <html>
        <head><title>Installation Error</title></head>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1>Installation Failed</h1>
          <p>There was an error connecting your store to PDFify.</p>
          <p>Error: ${errorMessage}</p>
          <p>Please <a href="https://pdfify.pro/contact">contact support</a> if this persists.</p>
        </body>
      </html>
    `);
  }
});

/**
 * OAuth Uninstall - Called by Shopify when app is uninstalled
 * POST /api/shopify/uninstall (webhook)
 */
router.post("/uninstall", async (req, res) => {
  try {
    const shopDomain = req.headers["x-shopify-shop-domain"];

    if (!shopDomain) {
      return res.status(400).send("Missing shop domain");
    }

    console.log(`🗑️ App uninstall requested for: ${shopDomain}`);

    // Mark shop as inactive and clear access token
    await ShopConfig.findOneAndUpdate(
      { shopDomain },
      { isActive: false, uninstalledAt: new Date(), shopifyAccessToken: null }
    );

    // Clear access token from user if one exists
    await User.findOneAndUpdate(
      { connectedShopDomain: shopDomain },
      { shopifyAccessToken: null, connectedShopDomain: null }
    );

    console.log(`✅ Cleanup completed for: ${shopDomain}`);
    res.status(200).send("OK");

  } catch (error) {
    console.error("❌ Uninstall webhook error:", error);
    res.status(500).send("Error processing uninstall");
  }
});

/**
 * Save access token for embedded app (for manual connection)
 * POST /api/shopify/save-token
 */
router.post("/save-token", async (req, res) => {
  try {
    const { shopDomain, accessToken } = req.body;
    if (!shopDomain || !accessToken) {
      return res.status(400).json({ error: "Missing shopDomain or accessToken" });
    }

    const normalizedShop = shopDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');

    // Validate the token by making a test API call to Shopify
    try {
      const testUrl = `https://${normalizedShop}/admin/api/2023-10/orders.json?limit=1`;
      await axios.get(testUrl, {
        headers: { "X-Shopify-Access-Token": accessToken },
        timeout: 10000
      });
      console.log(`✅ Token validated for shop: ${normalizedShop}`);
    } catch (validationErr) {
      console.error("❌ Token validation failed:", validationErr.response?.data || validationErr.message);
      if (validationErr.response?.status === 401 || validationErr.response?.status === 403) {
        return res.status(400).json({
          error: "Invalid or expired access token. Please check your token and ensure it has the required permissions: read_orders, read_products, read_themes"
        });
      }
      throw validationErr;
    }

    // Save to ShopConfig
    await ShopConfig.findOneAndUpdate(
      { shopDomain: normalizedShop },
      {
        shopDomain: normalizedShop,
        shopifyAccessToken: accessToken,
        connectedAt: new Date(),
        isActive: true
      },
      { upsert: true, new: true }
    );

    console.log(`✅ Access token saved for shop: ${normalizedShop}`);

    return res.json({
      success: true,
      message: "Access token saved successfully"
    });
  } catch (error) {
    console.error("❌ Save token error:", error);
    res.status(500).json({ error: "Failed to save access token: " + error.message });
  }
});

/**
 * Clear shop data (for testing/debugging)
 * POST /api/shopify/clear
 */
router.post("/clear", async (req, res) => {
  try {
    const { shopDomain } = req.body;
    if (!shopDomain) {
      return res.status(400).json({ error: "Missing shopDomain" });
    }

    const normalizedShop = shopDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');

    console.log(`🗑️ Clearing data for shop: ${normalizedShop}`);

    // Delete from ShopConfig
    const shopConfigResult = await ShopConfig.deleteOne({ shopDomain: normalizedShop });
    console.log(`   - ShopConfig deleted: ${shopConfigResult.deletedCount > 0}`);

    // Clear from User
    const userResult = await User.updateMany(
      { connectedShopDomain: normalizedShop },
      { $unset: { shopifyAccessToken: "", connectedShopDomain: "" } }
    );
    console.log(`   - Users updated: ${userResult.modifiedCount}`);

    res.json({
      success: true,
      message: "Shop data cleared successfully",
      shop: normalizedShop
    });
  } catch (error) {
    console.error("❌ Clear error:", error);
    res.status(500).json({ error: "Failed to clear shop data" });
  }
});

/**
 * Debug endpoint to check what's stored for a shop
 * GET /api/shopify/debug?shop=store.myshopify.com
 */
router.get("/debug", async (req, res) => {
  try {
    const { shop } = req.query;
    if (!shop) {
      return res.status(400).json({ error: "Missing shop parameter" });
    }

    const normalizedShop = shop.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');

    // Check ShopConfig
    const shopConfig = await ShopConfig.findOne({ shopDomain: normalizedShop });

    // Check User
    const user = await User.findOne({ connectedShopDomain: normalizedShop });

    const debugInfo = {
      shop: normalizedShop,
      shopConfig: {
        exists: !!shopConfig,
        isActive: shopConfig?.isActive,
        connectedAt: shopConfig?.connectedAt,
        hasAccessToken: !!shopConfig?.shopifyAccessToken,
        tokenLength: shopConfig?.shopifyAccessToken?.length || 0,
        tokenPrefix: shopConfig?.shopifyAccessToken?.substring(0, 10) + '...'
      },
      user: {
        exists: !!user,
        hasAccessToken: !!user?.shopifyAccessToken,
        tokenLength: user?.shopifyAccessToken?.length || 0,
        plan: user?.plan
      }
    };

    res.json(debugInfo);
  } catch (error) {
    console.error("❌ Debug error:", error);
    res.status(500).json({ error: "Debug error" });
  }
});

/**
 * Public connection test for embedded app (no authentication required)
 * GET /api/shopify/test-connection?shop=store.myshopify.com
 */
router.get("/test-connection", async (req, res) => {
  try {
    const { shop } = req.query;
    if (!shop) {
      return res.status(400).json({ error: "Missing shop parameter" });
    }

    const normalizedShop = shop.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');

    // Check if shop exists in database (was installed via OAuth)
    const shopConfig = await ShopConfig.findOne({ shopDomain: normalizedShop });

    if (!shopConfig) {
      return res.status(404).json({
        error: "Shop not found in database.",
        message: "Please install the app first.",
        shop: normalizedShop,
        debug: {
          hasShopConfig: false,
          oauthConfigured: !!(process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET)
        }
      });
    }

    // Check if shop has access token (from OAuth installation)
    const hasAccessToken = !!shopConfig.shopifyAccessToken;

    return res.json({
      success: true,
      shop: normalizedShop,
      isActive: shopConfig.isActive || false,
      hasAccessToken: hasAccessToken,
      connectedAt: shopConfig.connectedAt,
      message: hasAccessToken ? "Shop is properly connected!" : "Shop found but no access token. Please reinstall."
    });
  } catch (error) {
    console.error("❌ Connection test error:", error);
    res.status(500).json({ error: "Connection test failed" });
  }
});

/**
 * Get usage statistics for embedded app
 * GET /api/shopify/usage-stats?shopDomain=store.myshopify.com
 */
router.get("/usage-stats", async (req, res) => {
  try {
    const { shopDomain } = req.query;
    if (!shopDomain) {
      return res.status(400).json({ error: "Missing shopDomain" });
    }

    const normalizedShop = shopDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');

    // Get shop config with usage count
    const shopConfig = await ShopConfig.findOne({ shopDomain: normalizedShop });

    if (!shopConfig) {
      return res.status(404).json({ error: "Shop not found" });
    }

    // Get user to check plan tier
    const user = await User.findOne({ connectedShopDomain: normalizedShop });

    // Determine limit based on plan (default 30 for free/premium, 500 for pro)
    const limit = user?.plan === 'pro' ? 500 : 30;

    return res.json({
      used: shopConfig.usageCount || 0,
      limit: limit,
      shop: normalizedShop
    });
  } catch (error) {
    console.error("❌ Usage stats error:", error);
    res.status(500).json({ error: "Failed to fetch usage stats" });
  }
});

/**
 * Get branding settings for embedded app
 * GET /api/shopify/branding?shopDomain=store.myshopify.com
 */
router.get("/branding", async (req, res) => {
  try {
    const { shopDomain } = req.query;
    if (!shopDomain) {
      return res.status(400).json({ error: "Missing shopDomain" });
    }

    const normalizedShop = shopDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');

    const shopConfig = await ShopConfig.findOne({ shopDomain: normalizedShop });

    if (!shopConfig) {
      return res.status(404).json({ error: "Shop not found" });
    }

    return res.json({
      primaryColor: shopConfig.primaryColor || "#00a6cc",
      companyName: shopConfig.companyName || "",
      bankName: shopConfig.bankName || "",
      iban: shopConfig.iban || "",
      bic: shopConfig.bic || ""
    });
  } catch (error) {
    console.error("❌ Get branding error:", error);
    res.status(500).json({ error: "Failed to fetch branding settings" });
  }
});

/**
 * Save branding settings for embedded app
 * POST /api/shopify/branding
 */
router.post("/branding", async (req, res) => {
  try {
    const { shopDomain, primaryColor, companyName, bankName, iban, bic } = req.body;
    if (!shopDomain) {
      return res.status(400).json({ error: "Missing shopDomain" });
    }

    const normalizedShop = shopDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');

    const shopConfig = await ShopConfig.findOneAndUpdate(
      { shopDomain: normalizedShop },
      {
        primaryColor: primaryColor || "#00a6cc",
        companyName: companyName || "",
        bankName: bankName || "",
        iban: iban || "",
        bic: bic || ""
      },
      { upsert: true, new: true }
    );

    return res.json({
      message: "Branding saved successfully",
      primaryColor: shopConfig.primaryColor,
      companyName: shopConfig.companyName,
      bankName: shopConfig.bankName
    });
  } catch (error) {
    console.error("❌ Save branding error:", error);
    res.status(500).json({ error: "Failed to save branding settings" });
  }
});

/**
 * Save payment details for embedded app
 * POST /api/shopify/payment-details
 */
router.post("/payment-details", async (req, res) => {
  try {
    const { shopDomain, iban, bic, bankName } = req.body;
    if (!shopDomain) {
      return res.status(400).json({ error: "Missing shopDomain" });
    }

    const normalizedShop = shopDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');

    const shopConfig = await ShopConfig.findOneAndUpdate(
      { shopDomain: normalizedShop },
      {
        iban: iban || "",
        bic: bic || "",
        bankName: bankName || ""
      },
      { upsert: true, new: true }
    );

    return res.json({
      message: "Payment details saved successfully",
      iban: shopConfig.iban,
      bic: shopConfig.bic,
      bankName: shopConfig.bankName
    });
  } catch (error) {
    console.error("❌ Save payment details error:", error);
    res.status(500).json({ error: "Failed to save payment details" });
  }
});

/**
 * Public orders endpoint for embedded app (no authentication required)
 * Uses shop domain to find ShopConfig and access token
 * GET /api/shopify/orders-public?shopDomain=store.myshopify.com
 */
router.get("/orders-public", async (req, res) => {
  try {
    const { shopDomain, from, to } = req.query;
    if (!shopDomain) {
      return res.status(400).json({ error: "Missing shopDomain" });
    }

    const normalizedShop = shopDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');

    console.log(`📦 Fetching orders for: ${normalizedShop}`);

    // Find shop config with access token (from OAuth installation)
    const shopConfig = await ShopConfig.findOne({ shopDomain: normalizedShop });

    console.log(`📦 Shop config found: ${!!shopConfig}`);
    if (shopConfig) {
      console.log(`📦 Has access token: ${!!shopConfig.shopifyAccessToken}`);
      console.log(`📦 Token length: ${shopConfig.shopifyAccessToken?.length || 0}`);
      console.log(`📦 Token prefix: ${shopConfig.shopifyAccessToken?.substring(0, 15)}...`);
    }

    if (!shopConfig || !shopConfig.shopifyAccessToken) {
      console.error(`❌ Shop not connected: ${normalizedShop}`);
      return res.status(404).json({ error: "Shop not connected. Please install the app first." });
    }

    // Fetch orders from Shopify
    let shopifyOrdersUrl = `https://${normalizedShop}/admin/api/2023-10/orders.json?limit=250&status=any&fields=id,name,created_at,total_price,currency`;

    const params = [];
    if (from) params.push(`created_at_min=${encodeURIComponent(from + "T00:00:00Z")}`);
    if (to) params.push(`created_at_max=${encodeURIComponent(to + "T23:59:59Z")}`);
    if (params.length) shopifyOrdersUrl += `&${params.join("&")}`;

    console.log(`📦 Calling Shopify API: ${shopifyOrdersUrl.replace(shopConfig.shopifyAccessToken, '***TOKEN***')}`);

    const response = await axios.get(shopifyOrdersUrl, {
      headers: { "X-Shopify-Access-Token": shopConfig.shopifyAccessToken },
    });

    console.log(`✅ Orders fetched successfully: ${response.data.orders?.length || 0} orders`);

    const orders = response.data.orders.map(o => ({
      id: o.id,
      name: o.name,
      date: new Date(o.created_at).toISOString().slice(0, 10),
      total_price: o.total_price,
      currency: o.currency
    }));

    res.json({ orders });
  } catch (err) {
    console.error("❌ Failed to fetch orders:", err.response?.status, err.response?.data || err.message);
    console.error("❌ Full error:", err);

    if (err.response?.status === 401 || err.response?.status === 403) {
      res.status(401).json({
        error: "Invalid or expired access token",
        details: "Please reinstall the app to get a fresh token"
      });
    } else {
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  }
});

/**
 * Public invoice endpoint for embedded app (no authentication required)
 * POST /api/shopify/invoice-public
 */
router.post("/invoice-public", async (req, res) => {
  try {
    const { shopDomain, orderId, merchant } = req.body;
    if (!shopDomain || !orderId) {
      return res.status(400).json({ error: "Missing shopDomain or orderId" });
    }

    const normalizedShop = shopDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');

    // Verify shop is connected via OAuth
    const shopConfig = await ShopConfig.findOne({ shopDomain: normalizedShop });
    if (!shopConfig || !shopConfig.shopifyAccessToken) {
      return res.status(401).json({ error: "Shop not connected. Please reinstall the app." });
    }

    // Fetch order from Shopify
    let actualOrderId = orderId;
    if (typeof actualOrderId === "string" && actualOrderId.startsWith("gid://")) {
      actualOrderId = actualOrderId.split("/").pop();
    }

    const orderResp = await axios.get(`https://${normalizedShop}/admin/api/2023-10/orders/${actualOrderId}.json`, {
      headers: { "X-Shopify-Access-Token": shopConfig.shopifyAccessToken },
    });
    const order = orderResp.data.order;

    if (!order || !order.line_items) {
      return res.status(400).json({ error: "Invalid order data" });
    }

    // Map order items
    const items = (order.line_items || []).map((item) => {
      const quantity = parseFloat(item.quantity || 1);
      const price = parseFloat(item.price || 0);
      const net = price * quantity;
      const tax = (item.tax_lines || []).reduce((sum, t) => sum + parseFloat(t.price || 0), 0);
      const total = net + tax;
      return { name: item.title || item.name || "Item", quantity, price, net, tax, total, taxRate: 21 };
    });

    const subtotal = items.reduce((sum, i) => sum + i.net, 0);
    const taxTotal = items.reduce((sum, i) => sum + i.tax, 0);
    const total = subtotal + taxTotal;

    const invoiceData = {
      orderId: order.name || order.id,
      date: order.created_at ? new Date(order.created_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      items,
      subtotal,
      tax: taxTotal,
      total,
      vatRate: 21,
      customerName: `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim() || "Valued Customer",
      iban: shopConfig.iban || "DE89370400440532013000",
      bic: shopConfig.bic || "COBADEFFXXX",
      bankName: shopConfig.bankName || "",
      companyName: shopConfig.companyName || "",
      primaryColor: shopConfig.primaryColor || "#00a6cc",
      paymentTerms: order.payment_terms || "Due within 14 days",
      creator: "PDFify",
      locale: { language: "en" },
    };

    // Generate PDF using Java service for pro users
    // Check if there's an associated user with a pro plan
    const user = await User.findOne({ connectedShopDomain: normalizedShop });
    const userPlan = user?.plan || 'free';

    let pdfBuffer;
    if (userPlan === 'pro') {
      try {
        pdfBuffer = await generateJavaInvoice(invoiceData, shopDomain, order);
      } catch (javaError) {
        console.warn("Java service failed, falling back to Puppeteer:", javaError.message);
        pdfBuffer = await generatePuppeteerInvoice(invoiceData, order, shopDomain);
      }
    } else {
      pdfBuffer = await generatePuppeteerInvoice(invoiceData, order, shopDomain);
    }

    // Increment usage
    if (user) {
      await User.findByIdAndUpdate(user._id, { $inc: { usageCount: 1 } });
    }
    await ShopConfig.findOneAndUpdate(
      { shopDomain: normalizedShop },
      { $inc: { usageCount: 1 } }
    );

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=Invoice-${order.name || orderId}.pdf`,
    });
    res.send(pdfBuffer);
  } catch (error) {
    console.error("❌ Invoice generation error:", error);
    res.status(500).json({ error: "Failed to generate invoice", details: error.message });
  }
});

/**
 * Public ZIP endpoint for embedded app (no authentication required)
 * POST /api/shopify/invoices/zip-public
 */
router.post("/invoices/zip-public", async (req, res) => {
  try {
    const { shopDomain, from, to } = req.body;
    if (!shopDomain) {
      return res.status(400).json({ error: "Missing shopDomain" });
    }

    const normalizedShop = shopDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');

    // Verify shop is connected via OAuth
    const shopConfig = await ShopConfig.findOne({ shopDomain: normalizedShop });
    if (!shopConfig || !shopConfig.shopifyAccessToken) {
      return res.status(401).json({ error: "Shop not connected. Please reinstall the app." });
    }

    // Check if there's an associated user with a plan for usage limits
    const user = await User.findOne({ connectedShopDomain: normalizedShop });
    const planLimits = { free: 30, premium: 100, pro: Infinity };
    const userPlan = user?.plan || 'free';
    const limit = planLimits[userPlan] || 30;
    const currentUsage = user?.usageCount || 0;

    if (currentUsage >= limit && limit !== Infinity) {
      return res.status(429).json({ error: "Monthly limit reached. Please upgrade your plan." });
    }

    // Fetch orders from Shopify
    let shopifyOrdersUrl = `https://${normalizedShop}/admin/api/2023-10/orders.json?limit=50&status=any&fields=id,name,created_at,line_items,customer,total_price,currency,payment_terms`;
    const params = [];
    if (from) params.push(`created_at_min=${encodeURIComponent(from + "T00:00:00Z")}`);
    if (to) params.push(`created_at_max=${encodeURIComponent(to + "T23:59:59Z")}`);
    if (params.length) shopifyOrdersUrl += `&${params.join("&")}`;

    const response = await axios.get(shopifyOrdersUrl, {
      headers: { "X-Shopify-Access-Token": shopConfig.shopifyAccessToken },
    });
    const orders = response.data.orders;

    if (!orders.length) {
      return res.status(404).json({ error: "No orders found in this date range" });
    }

    const zip = new JSZip();

    // Process orders
    for (const order of orders) {
      const items = (order.line_items || []).map((item) => {
        const quantity = parseFloat(item.quantity || 1);
        const price = parseFloat(item.price || 0);
        const net = price * quantity;
        const tax = (item.tax_lines || []).reduce((sum, t) => sum + parseFloat(t.price || 0), 0);
        const total = net + tax;
        return { name: item.title || item.name || "Item", quantity, price, net, tax, total, taxRate: 21 };
      });

      const subtotal = items.reduce((sum, i) => sum + i.net, 0);
      const taxTotal = items.reduce((sum, i) => sum + i.tax, 0);
      const total = subtotal + taxTotal;

      const invoiceData = {
        orderId: order.name || order.id,
        date: order.created_at ? new Date(order.created_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
        items,
        subtotal,
        tax: taxTotal,
        total,
        vatRate: 21,
        customerName: `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim() || "Valued Customer",
        iban: shopConfig.iban || "DE89370400440532013000",
        bic: shopConfig.bic || "COBADEFFXXX",
        bankName: shopConfig.bankName || "",
        companyName: shopConfig.companyName || "",
        primaryColor: shopConfig.primaryColor || "#00a6cc",
        paymentTerms: order.payment_terms || "Due within 14 days",
        creator: "PDFify",
        locale: { language: "en" },
      };

      let pdfBuffer;
      if (userPlan === 'pro') {
        try {
          pdfBuffer = await generateJavaInvoice(invoiceData, shopDomain, order);
        } catch (javaError) {
          console.warn("Java service failed, falling back to Puppeteer:", javaError.message);
          pdfBuffer = await generatePuppeteerInvoice(invoiceData, order, shopDomain);
        }
      } else {
        pdfBuffer = await generatePuppeteerInvoice(invoiceData, order, shopDomain);
      }

      const safeOrderId = (order.name || order.id || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
      zip.file(`Invoice-${safeOrderId}.pdf`, pdfBuffer);
    }

    // Increment usage
    if (user) {
      await User.findByIdAndUpdate(user._id, { $inc: { usageCount: orders.length } });
    }
    await ShopConfig.findOneAndUpdate(
      { shopDomain: normalizedShop },
      { $inc: { usageCount: orders.length } }
    );

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename=Invoices_${from || "start"}_to_${to || "end"}.zip`,
    });
    res.send(zipBuffer);
  } catch (error) {
    console.error("❌ ZIP generation error:", error);
    res.status(500).json({ error: "Failed to generate ZIP", details: error.message });
  }
});


module.exports = router;