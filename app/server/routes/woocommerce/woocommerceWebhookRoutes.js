const express = require("express");
const router = express.Router();
const User = require("../../models/User");
const ShopConfig = require("../../models/ShopConfig");
const axios = require("axios");
const { incrementUsage } = require("../../utils/usageUtils");
const sendEmail = require("../../sendEmail");
const generateInvoice = require("../woocommerce/customerInvoice");
const { resolveLanguage } = require("../../utils/resolveLanguage");

router.post("/order-created", async (req, res) => {
  try {
    const order = req.body;
    const shopDomain = req.query.shopDomain?.toLowerCase();
    if (!shopDomain) return res.status(400).send("Missing shopDomain");

   
    res.status(200).send("Webhook received");

    const user = await User.findOne({ connectedWooDomain: shopDomain });
    if (!user) return;

    const shopConfig = await ShopConfig.findOne({ shopDomain }) || {};

    // Generate invoice PDF
    const { lang } = await resolveLanguage({ req, order, shopDomain, shopConfig });
    const pdfBuffer = await generateInvoice(order, shopDomain, lang, shopConfig);

    // Send to customer if email exists and allowed by merchant
    if (order.billing?.email && shopConfig.allowCustomerPDF) {
      await sendEmail({
        to: order.billing.email,
        subject: `Invoice for WooCommerce Order ${order.id}`,
        text: `Hello,\n\nYour invoice for order ${order.id} is attached.\n\nThanks for your purchase!`,
        attachments: [{ filename: `Invoice-${order.id}.pdf`, content: pdfBuffer, contentType: "application/pdf" }],
      });

      await incrementUsage(user, false, 1);
      console.log(`✉️ Invoice sent for order ${order.id}`);
    }

    console.log(`✅ Finished processing WooCommerce order webhook: ${order.id}`);
  } catch (err) {
    console.error("❌ WooCommerce webhook error:", err);
  }
});

module.exports = router;
