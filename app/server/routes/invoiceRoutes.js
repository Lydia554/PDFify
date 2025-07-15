const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const router = express.Router();
const fs = require("fs");
const archiver = require("archiver");
const User = require("../models/User");
const authenticate = require("../middleware/authenticate");
const dualAuth = require("../middleware/dualAuth");
const { generateZugferdXML } = require('../utils/zugferdHelper');
const { PDFDocument, PDFName, PDFHexString  } = require("pdf-lib");
const { execSync, execFile } = require("child_process");






const log = (message, data = null) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(message, data);
  }
};

function generateInvoiceHTML(data) {
  const items = Array.isArray(data.items) ? data.items : [];

  const logoUrl =
    typeof data.customLogoUrl === "string" && data.customLogoUrl.trim().length > 0
      ? data.customLogoUrl.trim()
      : "https://pdfify.pro/images/Logo.png";

  const userClass = data.isBasicUser ? "basic" : "premium";

  const watermarkHTML =
    data.isBasicUser && data.isPreview
      ? `<div class="watermark">FOR PRODUCTION ONLY — NOT AVAILABLE IN BASIC VERSION</div>`
      : "";

  const chartConfig = {
    type: "pie",
    data: {
      labels: ["Subtotal", "Tax"],
      datasets: [
        {
          data: [
            Number(data.subtotal?.replace(/[^\d.-]/g, "")) || 0,
            Number(data.tax?.replace(/[^\d.-]/g, "")) || 0,
          ],
        },
      ],
    },
  };

  const chartConfigEncoded = encodeURIComponent(JSON.stringify(chartConfig));

  const itemRows = items.length
    ? items
        .map(
          (item) => `
            <tr>
              <td>${item.name || ""}</td>
              <td>${item.quantity || ""}</td>
              <td>${item.price || ""}</td>
              <td>${item.net || "-"}</td>
              <td>${item.tax || "-"}</td>
              <td>${item.total || ""}</td>
            </tr>`
        )
        .join("")
    : `<tr><td colspan="6">No items available</td></tr>`;

  return `
<html>
  <head>
    <style>
      body {
        font-family: Arial, sans-serif;
        margin: 40px;
        padding: 0;
        background-color: #fff;
        color: #333;
      }
      .container {
        max-width: 800px;
        margin: 0 auto;
      }
      h1, h2 {
        text-align: center;
        color: #222;
      }
      .invoice-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 20px;
      }
      .invoice-header .left, .invoice-header .right {
        width: 48%;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin: 20px 0;
      }
      th, td {
        border: 1px solid #ccc;
        padding: 8px;
        text-align: left;
      }
      th {
        background-color: #f2f2f2;
      }
      .total {
        text-align: right;
        font-size: 1.1em;
        margin-top: 20px;
      }
      .footer {
        text-align: center;
        font-size: 0.9em;
        margin-top: 40px;
        color: #666;
      }
      .footer a {
        color: #666;
        text-decoration: none;
      }
      .chart-container {
        margin-top: 30px;
        text-align: center;
      }
      .watermark {
        position: fixed;
        top: 40%;
        left: 10%;
        width: 80%;
        text-align: center;
        font-size: 28px;
        font-weight: bold;
        color: rgba(200, 0, 0, 0.2);
        transform: rotate(-15deg);
        z-index: 1000;
        pointer-events: none;
      }
      body.basic {
        background-color: #fdfdfd;
      }
      body.premium {
        background-color: #fefefe;
      }
    </style>
  </head>
  <body class="${userClass}">
    <div class="container">
      <img src="${logoUrl}" alt="Logo" style="height: 60px; display:block; margin: auto;" />

      <h1>Invoice for ${data.customerName}</h1>

      <div class="invoice-header">
        <div class="left">
          <p><strong>Order ID:</strong> ${data.orderId}</p>
          <p><strong>Date:</strong> ${data.date}</p>
        </div>
        <div class="right">
          <p><strong>Customer:</strong><br>${data.customerName}</p>
          <p><strong>Email:</strong><br><a href="mailto:${data.customerEmail}">${data.customerEmail}</a></p>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Quantity</th>
            <th>Price</th>
            <th>Net</th>
            <th>Tax</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="5">Subtotal</td>
            <td>${data.subtotal}</td>
          </tr>
          <tr>
            <td colspan="5">Tax (${data.taxRate || "21%"})</td>
            <td>${data.tax}</td>
          </tr>
          <tr>
            <td colspan="5"><strong>Total</strong></td>
            <td><strong>${data.total}</strong></td>
          </tr>
        </tfoot>
      </table>

      <div class="total">
        <p><strong>Total Amount Due: ${data.total}</strong></p>
      </div>

      ${
        data.showChart
          ? `<div class="chart-container">
              <h2>Breakdown</h2>
              <img src="https://quickchart.io/chart?c=${chartConfigEncoded}" alt="Invoice Breakdown" style="max-width:500px;display:block;margin:auto;" />
            </div>`
          : ""
      }
    </div>

    ${watermarkHTML}

    <div class="footer">
      <p>Thanks for using our service!</p>
      <p>If you have questions, contact us at <a href="mailto:pdfifyapi@gmail.com">pdfifyapi@gmail.com</a>.</p>
      <p>&copy; 2025 🧾PDFify — All rights reserved.</p>
      <p>
        Generated using <strong>PDFify</strong>. Visit
        <a href="https://pdfify.pro/" target="_blank">our site</a> for more.
      </p>
    </div>
  </body>
</html>
`;
}



router.post("/generate-invoice", authenticate, dualAuth, async (req, res) => {
  console.log("🌐 /generate-invoice router hit");

  const iccPath =
    process.env.ICC_PROFILE_PATH ||
    path.resolve(__dirname, "../app/sRGB_IEC61966-2-1_no_black_scaling.icc");
  console.log("🔍 Using ICC profile path:", iccPath);

  try {
    const gsVersion = execSync("gs --version").toString().trim();
    console.log("📦 Ghostscript version:", gsVersion);
  } catch (err) {
    console.error("❌ Ghostscript not found:", err.message);
    return res.status(500).json({ error: "Ghostscript not installed." });
  }

  if (!fs.existsSync(iccPath)) {
    console.error("❌ ICC profile not found at path:", iccPath);
    return res.status(500).json({ error: "ICC profile missing." });
  } else {
    console.log("🖨️ ICC profile found:", iccPath);
  }

  const tmpDir = "/tmp/pdfify-batch-" + Date.now();
  console.log("📁 Creating temporary directory:", tmpDir);
  fs.mkdirSync(tmpDir);

  let browser;
  try {
    let requests = req.body.requests;
    console.log(
      "📩 Raw requests received:",
      Array.isArray(requests) ? requests.length : "not array"
    );

    if (!Array.isArray(requests)) {
      if (req.body.data) {
        requests = [{ data: req.body.data, isPreview: req.body.isPreview }];
        console.log("📩 Converted single request to array");
      } else {
        console.error("⚠️ No valid requests or data sent in request body");
        return res.status(400).json({ error: "You must send 1-100 requests." });
      }
    }

    if (requests.length === 0 || requests.length > 100) {
      console.error("⚠️ Invalid requests count:", requests.length);
      return res.status(400).json({ error: "You must send 1-100 requests." });
    }

    console.log("🔢 Number of invoice requests to process:", requests.length);

    const user = await User.findById(req.user.userId);
    if (!user) {
      console.error("❌ User not found:", req.user.userId);
      return res.status(404).json({ error: "User not found" });
    }

    console.log("👤 User found:", user._id, "plan:", user.plan);

    const now = new Date();
    if (!user.previewLastReset || now.getMonth() !== user.previewLastReset.getMonth()) {
      console.log("♻️ Resetting user preview count for new month");
      user.previewCount = 0;
      user.previewLastReset = now;
    }

    if (!user.usageLastReset || now.getMonth() !== user.usageLastReset.getMonth()) {
      console.log("♻️ Resetting user usage count for new month");
      user.usageCount = 0;
      user.usageLastReset = now;
    }

    console.log("🚀 Launching Puppeteer browser...");
    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });

    const results = [];

    for (const [index, { data, isPreview }] of requests.entries()) {
      console.log(`📝 Processing request #${index + 1}`);
      if (!data || typeof data !== "object") {
        console.warn(`⚠️ Skipping invalid or missing data at request #${index + 1}`);
        continue;
      }

      let invoiceData = { ...data };
      const country = invoiceData.country?.toLowerCase() || "slovenia";
      invoiceData.country = country;
      console.log(`🌍 Country set to: ${country}`);

      if (country === "germany" && Array.isArray(invoiceData.items)) {
        console.log("🇩🇪 Calculating German VAT for items");
        invoiceData.items = invoiceData.items.map((item, i) => {
          const totalNum = parseFloat(item.total?.replace(/[^\d.]/g, "") || "0");
          const taxRate = 0.19;
          const net = totalNum / (1 + taxRate);
          const taxAmount = totalNum - net;
          console.log(`  Item #${i + 1}: total=${totalNum}, net=${net.toFixed(2)}, tax=${taxAmount.toFixed(2)}`);
          return {
            ...item,
            tax: taxAmount.toFixed(2),
            net: net.toFixed(2),
          };
        });
      }

      if (typeof invoiceData.items === "string") {
        try {
          invoiceData.items = JSON.parse(invoiceData.items);
          console.log("🛠️ Parsed invoice items JSON string");
        } catch (e) {
          console.warn("⚠️ Failed to parse items JSON, setting empty array");
          invoiceData.items = [];
        }
      }

      if (!Array.isArray(invoiceData.items)) {
        console.warn("⚠️ Items is not an array, setting empty array");
        invoiceData.items = [];
      }

      console.log(`📦 Number of items to invoice: ${invoiceData.items.length}`);
      const safeOrderId = invoiceData.orderId || `invoice-${Date.now()}-${index}`;
      invoiceData.isBasicUser = !user.isPremium;
      if (!user.isPremium) {
        invoiceData.customLogoUrl = null;
        invoiceData.showChart = false;
      }

      console.log(`🆔 Using orderId: ${safeOrderId}`);

      if (isPreview && user.planType === "free") {
        if (user.previewCount < 3) {
          user.previewCount++;
          console.log(`👀 Incremented preview count to ${user.previewCount}`);
        } else {
          user.usageCount++;
          console.log(`⚠️ Preview limit reached, incremented usage count to ${user.usageCount}`);
        }
      } else if (["premium", "pro"].includes(user.plan)) {
        user.usageCount++;
        console.log(`🔥 Incremented usage count to ${user.usageCount} for plan ${user.plan}`);
      }

      console.log("🧾 Generating HTML for invoice...");
      const html = generateInvoiceHTML({ ...invoiceData, isPreview });

      if (!html || typeof html !== "string") {
        console.error("❌ generateInvoiceHTML returned invalid content");
        continue;
      } else {
        console.log(`✅ Generated HTML length: ${html.length}`);
      }

      const page = await browser.newPage();
      console.log("📄 Setting page content...");
      await page.setContent(html, { waitUntil: "networkidle0" });

      console.log("📄 Generating PDF buffer from page...");
      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "20mm", bottom: "20mm", left: "10mm", right: "10mm" },
      });
      console.log(`📄 PDF buffer generated, size: ${pdfBuffer.length} bytes`);
      await page.close();

      let finalPdfBytes = pdfBuffer;

      if (user.plan === "pro") {
        console.log("⚙️ User plan is pro, embedding ZUGFeRD XML and metadata...");
        const zugferdXml = generateZugferdXML(invoiceData);
        const xmlBuffer = Buffer.from(zugferdXml, "utf-8");
        const pdfDoc = await PDFDocument.load(pdfBuffer, { updateMetadata: false });

        const sanitizeMetadata = (str) =>
          String(str || "").replace(/[\r\n\t]+/g, " ").replace(/[^\x20-\x7E]/g, "?").trim();

        pdfDoc.setTitle(sanitizeMetadata(`Invoice ${safeOrderId}`));
        pdfDoc.setAuthor("PDFify User");
        pdfDoc.setSubject("ZUGFeRD Invoice");
        pdfDoc.setProducer("PDFify API");
        pdfDoc.setCreator("PDFify");
        pdfDoc.setKeywords(["invoice", "zugferd", "pdfa3"]);
        pdfDoc.setCreationDate(now);
        pdfDoc.setModificationDate(now);

        const embeddedFileStream = pdfDoc.context.flateStream(xmlBuffer, {
          Type: PDFName.of("EmbeddedFile"),
          Subtype: PDFName.of("application/xml"),
        });
        const embeddedFileRef = pdfDoc.context.register(embeddedFileStream);
        const fileName = "zugferd-invoice.xml";

        const efDict = pdfDoc.context.obj({ F: embeddedFileRef, UF: embeddedFileRef });
        const filespecDict = pdfDoc.context.obj({
          Type: PDFName.of("Filespec"),
          F: PDFHexString.of(fileName),
          UF: PDFHexString.of(fileName),
          EF: efDict,
          Desc: PDFHexString.of("ZUGFeRD invoice XML"),
          AFRelationship: PDFName.of("Data"),
        });
        const filespecRef = pdfDoc.context.register(filespecDict);

        const catalog = pdfDoc.catalog;
        let namesDict = catalog.lookup(PDFName.of("Names"));
        if (!namesDict) {
          namesDict = pdfDoc.context.obj({});
          catalog.set(PDFName.of("Names"), namesDict);
        }

        let embeddedFilesDict = namesDict.lookup(PDFName.of("EmbeddedFiles"));
        if (!embeddedFilesDict) {
          embeddedFilesDict = pdfDoc.context.obj({ Names: [] });
          namesDict.set(PDFName.of("EmbeddedFiles"), embeddedFilesDict);
        }

        let embeddedFilesArray = embeddedFilesDict.lookup(PDFName.of("Names"));
        if (!embeddedFilesArray) {
          embeddedFilesArray = pdfDoc.context.obj([]);
          embeddedFilesDict.set(PDFName.of("Names"), embeddedFilesArray);
        }

        embeddedFilesArray.push(PDFHexString.of(fileName));
        embeddedFilesArray.push(filespecRef);
        catalog.set(PDFName.of("AF"), pdfDoc.context.obj([filespecRef]));

        const xmpPath = path.resolve(__dirname, "../xmp/zugferd.xmp");
        console.log("🔍 Reading XMP file:", xmpPath);
        const rawXmp = fs.readFileSync(xmpPath, "utf-8");
        const sanitizedXmp = rawXmp.replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD]/g, "").trim();
        console.log("✅ XMP file sanitized");

        const metadataStream = pdfDoc.context.flateStream(Buffer.from(sanitizedXmp, "utf-8"), {
          Type: PDFName.of("Metadata"),
          Subtype: PDFName.of("XML"),
          Filter: PDFName.of("FlateDecode"),
        });
        const metadataRef = pdfDoc.context.register(metadataStream);
        catalog.set(PDFName.of("Metadata"), metadataRef);

        const iccData = fs.readFileSync(iccPath);
        const iccStream = pdfDoc.context.flateStream(iccData, {
          N: 3,
          Alternate: PDFName.of("DeviceRGB"),
          Filter: PDFName.of("FlateDecode"),
        });
        const iccRef = pdfDoc.context.register(iccStream);
        const outputIntentDict = pdfDoc.context.obj({
          Type: PDFName.of("OutputIntent"),
          S: PDFName.of("GTS_PDFA3"),
          OutputConditionIdentifier: PDFHexString.of("sRGB IEC61966-2.1"),
          Info: PDFHexString.of("sRGB IEC61966-2.1"),
          DestOutputProfile: iccRef,
        });
        catalog.set(PDFName.of("OutputIntents"), pdfDoc.context.obj([outputIntentDict]));

        finalPdfBytes = await pdfDoc.save({ useObjectStreams: false });
      }

      const filePath = path.join(tmpDir, `${safeOrderId}.pdf`);
      fs.writeFileSync(filePath, finalPdfBytes);
      results.push({ orderId: safeOrderId, path: filePath });
    }

    await user.save();
    res.status(200).json({ success: true, results });

  } catch (err) {
    console.error("❌ Error in /generate-invoice:", err);
    res.status(500).json({ error: "Internal server error." });
  } finally {
    if (browser) await browser.close();
  }
});

module.exports = router;