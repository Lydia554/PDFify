const express = require("express");
const router = express.Router();
const User = require("../../models/User");
const ShopConfig = require("../../models/ShopConfig");
const { resolveLanguage } = require("../../utils/resolveLanguage");
const { incrementUsage } = require("../../utils/usageUtils");
const generateInvoice = require("../woocommerce/customerInvoice");
const JSZip = require("jszip");

// WooCommerce REST API wrapper
const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;

// ----------------------------
// Connect WooCommerce Store
// ----------------------------
router.post("/connect", async (req, res) => {
  try {
    const { shopDomain, consumerKey, consumerSecret } = req.body;
    if (!shopDomain || !consumerKey || !consumerSecret) {
      return res.status(400).json({ error: "Missing WooCommerce credentials" });
    }

    const user = await User.findById(req.user?.userId || req.fullUser?._id);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.connectedWooDomain = shopDomain.toLowerCase();
    user.wooConsumerKey = consumerKey;
    user.wooConsumerSecret = consumerSecret;
    await user.save();

    res.json({ message: `WooCommerce store ${shopDomain} connected successfully.` });
  } catch (err) {
    console.error("Connect WooCommerce failed:", err);
    res.status(500).json({ error: "Failed to connect WooCommerce store" });
  }
});

// ----------------------------
// Disconnect WooCommerce Store
// ----------------------------
router.post("/disconnect", async (req, res) => {
  try {
    const user = await User.findById(req.user?.userId || req.fullUser?._id);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.connectedWooDomain = null;
    user.wooConsumerKey = null;
    user.wooConsumerSecret = null;
    await user.save();

    res.json({ message: "WooCommerce store disconnected successfully." });
  } catch (err) {
    console.error("Disconnect WooCommerce failed:", err);
    res.status(500).json({ error: "Failed to disconnect WooCommerce store" });
  }
});

// ----------------------------
// Generate Single Invoice
// ----------------------------
router.post("/invoice", async (req, res) => {
  try {
    const { shopDomain, orderId, order } = req.body;
    if (!shopDomain || !orderId) {
      return res.status(400).json({ error: "Missing shopDomain or orderId" });
    }

    const user = await User.findOne({ connectedWooDomain: shopDomain });
    if (!user) return res.status(404).json({ error: "Store not connected" });

    // Set up WooCommerce API client
    const api = new WooCommerceRestApi({
      url: `https://${shopDomain}`,
      consumerKey: user.wooConsumerKey,
      consumerSecret: user.wooConsumerSecret,
      version: "wc/v3"
    });

    // Fetch order if not provided
    let finalOrder = order;
    if (!finalOrder) {
      const response = await api.get(`orders/${orderId}`);
      finalOrder = response.data;
    }

    if (!finalOrder?.line_items) {
      return res.status(400).json({ error: "Invalid or missing order data" });
    }

    const shopConfig = (await ShopConfig.findOne({ shopDomain })) || {};
    const { lang } = await resolveLanguage({ req, order: finalOrder, shopDomain, shopConfig });

    // Generate PDF
    const pdfBuffer = await generateInvoice(finalOrder, shopDomain, lang, shopConfig);
    await incrementUsage(user, false, 1);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=Invoice-${finalOrder.id}.pdf`
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error("WooCommerce invoice error:", err);
    res.status(500).json({ error: "Invoice generation failed" });
  }
});

// ----------------------------
// Bulk ZIP of Invoices
// ----------------------------
router.post("/invoices/zip", async (req, res) => {
  try {
    const { shopDomain, from, to } = req.body;
    if (!shopDomain) return res.status(400).json({ error: "Missing shopDomain" });

    const user = await User.findOne({ connectedWooDomain: shopDomain });
    if (!user) return res.status(404).json({ error: "Store not connected" });

    const api = new WooCommerceRestApi({
      url: `https://${shopDomain}`,
      consumerKey: user.wooConsumerKey,
      consumerSecret: user.wooConsumerSecret,
      version: "wc/v3"
    });

    // Fetch orders in date range
    let params = { per_page: 50, status: "any" };
    if (from) params.after = `${from}T00:00:00Z`;
    if (to) params.before = `${to}T23:59:59Z`;

    const response = await api.get("orders", params);
    const orders = response.data;
    if (!orders.length) return res.status(404).json({ error: "No orders found in this range" });

    // Generate PDFs in memory
    const zip = new JSZip();
    for (const order of orders) {
      const shopConfig = (await ShopConfig.findOne({ shopDomain })) || {};
      const { lang } = await resolveLanguage({ req, order, shopDomain, shopConfig });

      const pdfBuffer = await generateInvoice(order, shopDomain, lang, shopConfig);
      zip.file(`Invoice_${order.id}.pdf`, pdfBuffer);
    }

    // Increment usage for all orders
    await incrementUsage(user, false, orders.length);

    // Return ZIP
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename=Invoices_${from || "start"}_to_${to || "end"}.zip`
    });
    res.send(zipBuffer);
  } catch (err) {
    console.error("WooCommerce bulk ZIP error:", err);
    res.status(500).json({ error: "Failed to generate ZIP" });
  }
});

module.exports = router;
