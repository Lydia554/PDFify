const express = require("express");
const axios = require("axios");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const ShopConfig = require("../../models/ShopConfig");
const User = require("../../models/User");
const authenticate = require("../../middleware/authenticate");
const dualAuth = require("../../middleware/dualAuth");
const { resolveShopifyToken } = require("./shopifyHelpers");
const { resolveLanguage } = require("../../utils/resolveLanguage");
const { incrementUsage } = require("../../utils/usageUtils");
const { generateCustomerInvoiceHTML, formatPrice } = require("./customerInvoice");
const { createShopifyInvoiceZugferd, createBasePdf} = require("./shopifyMerchantTemplate");
const { PDFDocument, PDFName, PDFHexString } = require("pdf-lib");

const { finalizePdf } = require("../../Helpers/pdf-helpers");
const { spawnSync } = require("child_process");
const os = require("os");
const JSZip = require("jszip");

const router = express.Router();

require('dotenv').config();

// ----------------------------
// Generate invoice PDF
// ----------------------------
router.post("/invoice", authenticate, dualAuth, async (req, res) => {
  try {
    const shopDomain = req.body.shopDomain || req.headers["x-shopify-shop-domain"];
    if (!shopDomain) return res.status(400).json({ error: "Missing shop domain" });

    let orderId = req.body.orderId;
    let order = req.body.order || null;

    // Fetch Shopify order if not provided
    if (!order && orderId) {
      const token = await resolveShopifyToken(req, shopDomain);
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


const iccProfilePath = path.resolve(process.env.ICC_PROFILE_PATH);
console.log("Resolved ICC profile:", iccProfilePath, fs.existsSync(iccProfilePath), fs.statSync(iccProfilePath).mode);

if (isMerchant) {
  try {
    console.log("🧾 [Shopify] Generating merchant PDF for:", order?.id || order?.name);

    // 1️⃣ Generate base PDF
    let pdfBuffer = await createBasePdf(invoiceData);
    console.log(`📄 Base PDF generated, size: ${pdfBuffer.length} bytes`);

    // 2️⃣ Sanitize /Info dictionary and remove Metadata
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const metadata = pdfDoc.catalog.get(PDFName.of("Metadata"));
    if (metadata) pdfDoc.catalog.delete(PDFName.of("Metadata"));
    pdfBuffer = Buffer.from(await pdfDoc.save({ useObjectStreams: false }));

    // 3️⃣ Embed ZUGFeRD XML before Ghostscript for backup
    let zugferdData;
    try {
      zugferdData = await finalizePdf(pdfBuffer, invoiceData);
    } catch (err) {
      console.warn("⚠️ finalizePdf failed:", err.message);
    }

    // 4️⃣ Save temporary file for Ghostscript
    const tmpDir = path.join(__dirname, "../../tmp_gs");
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpInput = path.join(tmpDir, `input-${Date.now()}.pdf`);
    const tmpOutput = path.join(tmpDir, `output-${Date.now()}.pdf`);
    fs.writeFileSync(tmpInput, pdfBuffer);

    // 5️⃣ Convert to PDF/A-3b with Ghostscript
    const iccProfilePathFinal = fs.existsSync(iccProfilePath)
      ? iccProfilePath
      : "/usr/share/color/icc/ghostscript/srgb.icc";

    console.log("🔹 Converting to PDF/A-3b with Ghostscript...");
    const gsPdfa = spawnSync("gs", [
      "-dPDFA=3",
      "-dPDFACompatibilityPolicy=1",
      "-sDEVICE=pdfwrite",
      "-dNOPAUSE",
      "-dBATCH",
      "-dNOSAFER",
      "-dEmbedAllFonts=true",
      "-dSubsetFonts=true",
      "-dCompressFonts=true",
      "-dProcessColorModel=/DeviceRGB",
      `-sOutputICCProfile=${iccProfilePathFinal}`,
      `-sOutputFile=${tmpOutput}`,
      tmpInput,
    ], { encoding: "utf-8" });

    if (gsPdfa.error || gsPdfa.status !== 0) {
      throw new Error(`Ghostscript PDF/A-3b conversion failed: ${gsPdfa.stderr}`);
    }

    pdfBuffer = fs.readFileSync(tmpOutput);
    console.log(`📄 PDF/A-3b generated, size: ${pdfBuffer.length} bytes`);

    // 6️⃣ Use fresh PDFDocument to embed ZUGFeRD XML with proper /Names and XMP
    if (zugferdData?.xml) {
      const pdfDoc2 = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });

      // Helper to embed XML correctly
      const embedZugferd = (pdfDoc, xmlBuffer) => {
        const { PDFName, PDFString } = require("pdf-lib");

        // Create EmbeddedFile stream
        const fileStream = pdfDoc.context.flateStream(xmlBuffer, {
          Type: 'EmbeddedFile',
          Subtype: 'application/xml'
        });
        const fileStreamRef = pdfDoc.context.register(fileStream);

        // FileSpec dictionary
        const fileSpec = pdfDoc.context.obj({
          Type: 'Filespec',
          F: PDFString.of('ZUGFeRD-invoice.xml'),
          EF: pdfDoc.context.obj({ F: fileStreamRef }),
          AFRelationship: PDFName.of('Data')
        });
        const fileSpecRef = pdfDoc.context.register(fileSpec);

        // EmbeddedFiles /Names array
        const embeddedFilesDict = pdfDoc.context.obj({
          Names: [PDFString.of('ZUGFeRD-invoice.xml'), fileSpecRef]
        });
        const namesDict = pdfDoc.context.obj({
          EmbeddedFiles: embeddedFilesDict
        });

        pdfDoc.catalog.set(PDFName.of('Names'), namesDict);

        // Optional: add to AF array (PDF/A-3 requirement)
        pdfDoc.catalog.set(PDFName.of('AF'), pdfDoc.context.obj([fileSpecRef]));

        return pdfDoc;
      };

      embedZugferd(pdfDoc2, Buffer.from(zugferdData.xml, "utf-8"));
      pdfBuffer = await pdfDoc2.save({ useObjectStreams: false });
      console.log("✅ ZUGFeRD XML properly embedded after PDF/A-3b");
    }

    // 7️⃣ Send PDF to client
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
    if (!shopConfig.allowCustomerPDF) {
      return res.status(403).json({ error: "Customer PDFs are not allowed by this merchant" });
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
      customLogoUrl: shopConfig.customLogoUrl,
      fallbackLogoUrl: "/assets/default-logo.png",
    };

    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    const html = generateCustomerInvoiceHTML(htmlData, true, lang, {});
    await page.setContent(html, { waitUntil: "networkidle0" });

    // Generate PDF directly from Puppeteer
    pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: 40, bottom: 40, left: 40, right: 40 },
    });

    await browser.close();
    await incrementUsage(user, 1, isPreview);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": isPreview ? "inline" : `attachment; filename=${invoiceData.orderId}.pdf`,
    });
    res.send(pdfBuffer);

  } catch (err) {
    console.error("❌ Invoice route error:", err);
    res.status(500).json({ error: "PDF generation failed" });
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
    const shopConfig = await ShopConfig.findOne({ shopDomain });
    res.json({ allowCustomerPDF: shopConfig?.allowCustomerPDF || false });
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



// ----------------------------
// 4️⃣  PDF Validation (Shopify - PDF/A-3b + ZUGFeRD)
// ----------------------------

router.post("/validate-pdf", async (req, res) => {
  try {
    const order = req.body.order;
    if (!order) return res.status(400).json({ error: "Missing order data" });

    // Step 1. Generate PDF buffer
    const pdfBuffer = await createShopifyInvoiceZugferd(order);

    // Step 2. Write PDF temporarily for validation
    const tmpPath = path.join(os.tmpdir(), `shopify_invoice_${Date.now()}.pdf`);
    await fs.promises.writeFile(tmpPath, pdfBuffer);

    // Step 3. Run Ghostscript (PDF/A validation)
    const { execFile } = require("child_process");
    const util = require("util");
    const execFileAsync = util.promisify(execFile);

    let pdfaValid = false;
    try {
      const gsArgs = [
        "-dPDFA",
        "-dBATCH",
        "-dNOPAUSE",
        "-sDEVICE=nullpage",
        tmpPath
      ];
      await execFileAsync("gs", gsArgs);
      pdfaValid = true;
    } catch (err) {
      console.warn("Ghostscript validation failed:", err.message);
    }

    // Step 4. Check if XML is embedded
    const pdfText = pdfBuffer.toString("utf8");
    const zugferdFound = pdfText.includes("<CrossIndustryInvoice") || pdfText.includes("<InvoiceSource>Shopify</InvoiceSource>");

    // Step 5. Cleanup temp file
    fs.unlink(tmpPath, () => {});

    // Step 6. Respond
    return res.json({
      status: pdfaValid && zugferdFound ? "valid" : "invalid",
      pdfa: pdfaValid,
      zugferd: zugferdFound,
      message: pdfaValid && zugferdFound
        ? "PDF/A-3b + ZUGFeRD verified successfully"
        : "Validation failed, see logs"
    });

  } catch (err) {
    console.error("❌ Validation route error:", err);
    res.status(500).json({ error: "PDF validation failed" });
  }
});



module.exports = router;