const express = require("express");
const router = express.Router();
const User = require("../models/User");
const axios = require("axios");
const sendEmail = require("../sendEmail");

router.post("/order-created", async (req, res) => {
  const shopDomain = req.headers["x-shopify-shop-domain"];
  const order = req.body;

  console.log("🧾 Order webhook received");
  console.log("🏪 x-shopify-shop-domain:", shopDomain);
  console.log("📦 Order payload:", JSON.stringify(order, null, 2));

  if (!shopDomain || !order || !order.id) {
    console.error("❌ Missing shop domain or order ID");
    return res.status(400).send("Missing shop domain or order payload");
  }

  const normalizedShopDomain = shopDomain.trim().toLowerCase();

  try {
    const user = await User.findOne({ connectedShopDomain: normalizedShopDomain });

    if (!user || !user.shopifyAccessToken) {
      console.error(`❌ No user or token found for ${normalizedShopDomain}`);
      return res.status(404).send("User or token not found");
    }

    // Call Shopify invoice PDF API to generate PDF (returns PDF buffer)
    const invoiceResponse = await axios.post(
      "https://pdf-api.portfolio.lidija-jokic.com/shopify/invoice",
      { order }, 
      {
        headers: {
          "x-shopify-shop-domain": normalizedShopDomain,
          "x-shopify-access-token": user.shopifyAccessToken,
        },
        responseType: "arraybuffer",
      }
    );

    const pdfBuffer = Buffer.from(invoiceResponse.data, "binary");

    // Send email with PDF invoice attached
    await sendEmail({
      to: user.email,
      subject: `Invoice for Shopify Order ${order.name || order.id}`,
      text: `Hello ${user.name || ""},\n\nYour invoice for order ${order.name || order.id} is attached.\n\nThanks for using PDFify!`,
      attachments: [
        {
          filename: `Invoice-${order.name || order.id}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    console.log("✅ Email with invoice sent to", user.email);

    // Increment usage count for this user
    user.usageCount = (user.usageCount || 0) + 1;
    await user.save();

    res.status(200).send("Invoice generated and emailed.");
  } catch (err) {
    console.error("❌ Error in webhook handler:", err);
    res.status(500).send("Internal Server Error");
  }
});


router.get("/connection", authenticate, async (req, res) => {

  try {
    const connectedShopDomain = req.fullUser.connectedShopDomain || null;
    res.json({ connectedShopDomain });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch Shopify connection" });
  }
});


router.post("/connect", authenticate, async (req, res) => {
  try {
    const { shopDomain, accessToken } = req.body;

    if (!shopDomain || !accessToken) {
      return res.status(400).json({ error: "Shop domain and access token required" });
    }

    const normalizedShopDomain = shopDomain.toLowerCase();

    // Use req.fullUser (the Mongoose doc) to update and save
    req.fullUser.connectedShopDomain = normalizedShopDomain;
    req.fullUser.shopifyAccessToken = accessToken;
    await req.fullUser.save();

    res.json({ message: `Shopify store ${normalizedShopDomain} connected successfully.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to connect Shopify store" });
  }
});

router.post("/disconnect", authenticate, async (req, res) => {
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

module.exports = router;
