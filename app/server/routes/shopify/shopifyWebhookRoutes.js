const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const User = require("../../models/User");
const ShopConfig = require("../../models/ShopConfig");
const axios = require("axios");
const puppeteer = require("puppeteer");
const sendEmail = require("../../sendEmail");
const { enrichLineItemsWithImages } = require("./shopifyHelpers");
const { resolveLanguage } = require("../../utils/resolveLanguage");
const { incrementUsage } = require("../../utils/usageUtils");

// Shopify webhook verification
function verifyShopifyWebhook(req, res, next) {
  if (process.env.NODE_ENV !== "production") return next();

  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
  const body = req.rawBody;

  if (!hmacHeader || !body) return res.status(200).send("OK");

  const generatedHmac = crypto
    .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(body, "utf8")
    .digest("base64");

  if (generatedHmac !== hmacHeader) return res.status(200).send("OK");

  next();
}

// Webhook for new orders
router.post(
  "/order-created",
  express.raw({
    type: "application/json",
    verify: (req, res, buf) => { req.rawBody = buf; },
  }),
  verifyShopifyWebhook,
  async (req, res) => {
    let parsedPayload;
    try {
      parsedPayload = JSON.parse(req.rawBody.toString());
    } catch {
      return res.status(200).send("OK");
    }

    const order = parsedPayload.order || parsedPayload;
    const shopDomain = (req.headers["x-shopify-shop-domain"] || parsedPayload.shopDomain)?.trim().toLowerCase();
    if (!shopDomain) return res.status(200).send("OK");

    res.status(200).send("Webhook received");

    try {
      const user = await User.findOne({ connectedShopDomain: shopDomain });
      const shopConfig = await ShopConfig.findOne({ shopDomain });

      if (!user) return;

      const { lang } = await resolveLanguage({ req, order, shopDomain, shopConfig: shopConfig || {} });

      await processOrderAsync({
        order,
        user,
        accessToken: user.shopifyAccessToken,
        shopDomain,
        lang,
        allowCustomerPDF: shopConfig?.allowCustomerPDF || false
      });
    } catch (err) {
      console.error("❌ Error in webhook async handler:", err);
    }
  }
);

async function processOrderAsync({ order, user, accessToken, shopDomain, lang, allowCustomerPDF }) {
  try {
    order.line_items = await enrichLineItemsWithImages(order.line_items, shopDomain, accessToken);

    console.log("📧 [Direct] Calling customer invoice generation directly (bypassing HTTP)...");

    // Import customer invoice generator
    const { generateCustomerInvoiceHTML, formatPrice: customerFormatPrice } = require("./customerInvoice");
    const localeMap = {
      sl: require("../../locales/sl.json"),
      en: require("../../locales/en.json"),
      de: require("../../locales/de.json")
    };

    // Map order items (same logic as invoice route)
    const items = (order.line_items || []).map((item) => {
      const quantity = parseFloat(item.quantity || 1);
      const price = parseFloat(item.price || 0);
      const net = price * quantity;
      const tax = (item.tax_lines || []).reduce((sum, t) => sum + parseFloat(t.price || 0), 0);
      const total = net + tax;
      return { name: item.title || item.name || "Item", quantity, price, net, tax, total };
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
      customerEmail: order.email || "",
      iban: "DE89370400440532013000",
      currency: order.currency || "EUR"
    };

    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    const locale = localeMap[lang] || localeMap["en"];

    const htmlData = {
      ...invoiceData,
      items: items.map(i => ({
        ...i,
        formattedPrice: customerFormatPrice(i.price, order.currency || "EUR", lang || "en"),
        formattedNet: customerFormatPrice(i.net, order.currency || "EUR", lang || "en"),
        formattedTax: customerFormatPrice(i.tax, order.currency || "EUR", lang || "en"),
        formattedTotal: customerFormatPrice(i.total, order.currency || "EUR", lang || "en"),
      })),
      formattedSubtotal: customerFormatPrice(subtotal, order.currency || "EUR", lang || "en"),
      formattedTaxTotal: customerFormatPrice(taxTotal, order.currency || "EUR", lang || "en"),
      formattedTotal: customerFormatPrice(total, order.currency || "EUR", lang || "en"),
      shopName: shopDomain,
      currency: order.currency || "EUR",
      locale: lang || "en",
      customLogoUrl: "",
    };

    const html = generateCustomerInvoiceHTML(htmlData, true, lang, locale);
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

    console.log("📧 [Direct] PDF generated successfully, size:", pdfBuffer.length, "bytes");
    console.log("📧 [Direct] PDF starts with %PDF:", pdfBuffer.toString("utf8", 0, 4) === "%PDF");

    // Page count (always 1 for customer invoices)
    let pageCount = 1;

    // Send PDF email and increment usage only if allowed
    if (!order.email) {
      console.warn(`⚠️ Order ${order.id} has no customer email, skipping PDF email and usage increment.`);
    } else if (!allowCustomerPDF) {
      console.log(`⚠️ Merchant has NOT approved customer PDFs for shop ${shopDomain}. Skipping PDF email and usage increment.`);
    } else {
      const attachment = {
        filename: `Invoice-${order.name || order.id}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf"
      };

      console.log("📧 [Email] Preparing to send email with PDF attachment:");
      console.log("📧 [Email] - To:", order.email);
      console.log("📧 [Email] - Filename:", attachment.filename);
      console.log("📧 [Email] - Attachment size:", attachment.content.length, "bytes");
      console.log("📧 [Email] - Content type:", attachment.contentType);

      await sendEmail({
        to: order.email,
        subject: `Invoice for Shopify Order ${order.name || order.id}`,
        text: `Hello,\n\nYour invoice for order ${order.name || order.id} is attached.\n\nThanks for your purchase!`,
        attachments: [attachment],
      });
      console.log(`✉️ Customer PDF SENT for order ${order.id} to ${order.email}`);

      // Increment usage only after sending PDF
      try {
        await incrementUsage(user, false, pageCount);
        console.log(`📄 Invoice page count: ${pageCount}, usage updated for user ${user.email}`);
      } catch (err) {
        console.error(`❌ Failed to increment usage for user ${user.email}:`, err);
      }
    }

    console.log(`✅ Finished processing order: ${order.id}`);
  } catch (err) {
    console.error("❌ Error during async order processing:", err);
  }
}

module.exports = router;
