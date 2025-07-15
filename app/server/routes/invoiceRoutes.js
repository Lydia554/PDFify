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
            Number(data.subtotal.replace(/[^\d.-]/g, '')) || 0,
            Number(data.tax.replace(/[^\d.-]/g, '')) || 0,
          ],
        },
      ],
    },
  };

  const chartConfigEncoded = encodeURIComponent(JSON.stringify(chartConfig));

  return `
<html>
  <head>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&display=swap');

  body {
    font-family: 'Open Sans', sans-serif;
    color: #333;
    background: #f4f7fb;
    margin: 0;
    padding: 0;
    min-height: 100vh;
    position: relative;
  }

  .container {
    max-width: 800px;
    margin: 20px auto;
    padding: 30px 40px 160px;
    background: linear-gradient(to bottom right, #ffffff, #f8fbff);
    box-shadow: 0 8px 25px #2a3d66;
    border-radius: 16px;
    border: 1px solid #e0e4ec;
    position: relative;
    z-index: 1;
  }

  .premium .table,
  .basic .table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 20px;
  }

  .premium .table th,
  .premium .table td {
    padding: 14px;
    border: 1px solid #dee2ef;
    text-align: left;
  }

  .premium .table th {
    background-color: #dbe7ff;
    color: #2a3d66;
    font-weight: 600;
  }

  .premium .table td {
    color: #444;
    background-color: #fdfdff;
  }

  .premium .table tr:nth-child(even) td {
    background-color: #f6f9fe;
  }

  .premium .table tfoot td {
    background-color: #dbe7ff;
    font-weight: bold;
    color: #2a3d66;
  }

  .premium .total p {
    font-weight: bold;
    color: #2a3d66;
  }

  .basic .table th,
  .basic .table td {
    padding: 14px;
    border: 1px solid #ccc;
    text-align: left;
  }

  .basic .table th {
    background-color: #fff;
    color: #333;
    font-weight: 600;
  }

  .basic .table td {
    color: #444;
    background-color: #fff;
  }

  .basic .table tr:nth-child(even) td {
    background-color: #f9f9f9;
  }

  .basic .table tfoot td {
    background-color: #fff;
    font-weight: bold;
  }

  .basic .total p {
    font-weight: normal;
    color: #333;
  }

  .watermark {
    position: fixed;
    top: 40%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-45deg);
    font-size: 60px;
    color: #ffcccc;
    font-weight: 900;
    pointer-events: none;
    user-select: none;
    z-index: 9999;
    white-space: nowrap;
  }

  .footer {
    position: static;
    max-width: 800px;
    margin: 40px auto 10px auto;
    padding: 10px 20px;
    background-color: #f0f2f7;
    color: #555;
    border-top: 2px solid #cbd2e1;
    text-align: center;
    line-height: 1.6;
    font-size: 11px;
    border-radius: 0 0 16px 16px;
    box-sizing: border-box;
  }

  .footer p {
    margin: 6px 0;
  }

  .footer a {
    color: #4a69bd;
    text-decoration: none;
    word-break: break-word;
  }

  .footer a:hover {
    text-decoration: underline;
  }

  /* ========================== */
  /* PDF/A-3b compliant override */
  /* ========================== */
 .pdfa-clean .container {
    background-color: #ffffff !important;
    box-shadow: none !important;
    border: 1px solid #ccc !important;
  }
  .pdfa-clean .premium .table th {
    background-color: #e6e6e6 !important;
    color: #000 !important;
  }
  .pdfa-clean .premium .table td {
    background-color: #ffffff !important;
    color: #000 !important;
  }
  .pdfa-clean .premium .table tr:nth-child(even) td {
    background-color: #f2f2f2 !important;
  }
  .pdfa-clean .footer {
    background-color: #eaeaea !important;
    color: #000 !important;
    border-top: 1px solid #bbb !important;
  }
  .pdfa-clean .watermark {
    display: none !important;
  }
</style>

  </head>
  <body class="${userClass}">
    <div class="container">
      <img src="${logoUrl}" alt="Logo" style="height: 60px;" />

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

<table class="table">
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
    ${
      items.length > 0
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
            </tr>
            `
            )
            .join("")
        : `<tr><td colspan="6">No items available</td></tr>`
    }
  </tbody>
  <tfoot>
    <tr>
      <td colspan="5">Subtotal</td>
      <td>${data.subtotal}</td>
    </tr>
    <tr>
      <td colspan="5">Tax (${data.taxRate || '21%'})</td>
      <td>${data.tax}</td>
    </tr>
    <tr>
      <td colspan="5">Total</td>
      <td>${data.total}</td>
    </tr>
  </tfoot>
</table>

      <div class="total">
        <p>Total Amount Due: ${data.total}</p>
      </div>

      ${
        data.showChart
          ? `
        <div class="chart-container">
          <h2>Breakdown</h2>
          <img src="https://quickchart.io/chart?c=${chartConfigEncoded}" alt="Invoice Breakdown" style="max-width:500px;display:block;margin:auto;" />
        </div>
          `
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

  const iccPath = process.env.ICC_PROFILE_PATH || path.resolve(__dirname, "../app/sRGB_IEC61966-2-1_no_black_scaling.icc");
  console.log("🔍 Using ICC profile path:", iccPath);

  // Ghostscript check
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

  let browser;
  const tmpDir = "/tmp/pdfify-batch-" + Date.now();
  console.log("📁 Creating temporary directory:", tmpDir);
  fs.mkdirSync(tmpDir);

  try {
    let requests = req.body.requests;

    if (!Array.isArray(requests)) {
      if (req.body.data) {
        requests = [{ data: req.body.data, isPreview: req.body.isPreview || false }];
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
    console.log("👤 User found:", user._id.toString(), "plan:", user.plan);

    // Reset preview & usage counts monthly
    const now = new Date();
    if (!user.previewLastReset || now.getMonth() !== user.previewLastReset.getMonth() || now.getFullYear() !== user.previewLastReset.getFullYear()) {
      console.log("♻️ Resetting user preview count for new month");
      user.previewCount = 0;
      user.previewLastReset = now;
    }
    if (!user.usageLastReset || now.getMonth() !== user.usageLastReset.getMonth() || now.getFullYear() !== user.usageLastReset.getFullYear()) {
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
        results.push({ error: "Invalid or missing data" });
        continue;
      }

      let invoiceData = { ...data };

      // Country normalization and VAT calculation for Germany
      const country = invoiceData.country?.toLowerCase() || "slovenia";
      invoiceData.country = country;
      console.log(`🌍 Country set to: ${country}`);

      if (country === "germany" && Array.isArray(invoiceData.items)) {
        console.log("🇩🇪 Calculating German VAT for items");
        invoiceData.items = invoiceData.items.map((item, i) => {
          const totalNum = parseFloat(item.total?.toString().replace(/[^\d.]/g, "") || "0");
          const taxRate = 0.19; // 19% VAT Germany
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

      // Prepare order ID
      const safeOrderId = invoiceData.orderId || `invoice-${Date.now()}-${index}`;
      invoiceData.isBasicUser = !user.isPremium;

      if (!user.isPremium) {
        invoiceData.customLogoUrl = null;
        invoiceData.showChart = false;
      }

      // Usage and preview count logic
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
      } else {
        // For other plans or unknown, still increment usage count as fallback
        user.usageCount++;
        console.log(`ℹ️ Incremented usage count to ${user.usageCount} as fallback`);
      }

      console.log("🧾 Generating HTML for invoice...");
      const html = generateInvoiceHTML({ ...invoiceData, isPreview });

      if (!html || typeof html !== "string") {
        console.error("❌ generateInvoiceHTML returned invalid content");
        results.push({ error: "Failed to generate invoice HTML" });
        continue;
      }
      console.log(`✅ Generated HTML length: ${html.length}`);

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

      // Embed ZUGFeRD XML and metadata if pro plan
      if (user.plan === "pro") {
        console.log("⚙️ User plan is pro, embedding ZUGFeRD XML and metadata...");

        const zugferdXml = generateZugferdXML(invoiceData);
        const xmlBuffer = Buffer.from(zugferdXml, "utf-8");

        const pdfDoc = await PDFDocument.load(pdfBuffer, { updateMetadata: false });

        const sanitizeMetadata = (str) =>
          String(str || "").replace(/[\r\n\t]+/g, " ").replace(/[^\x20-\x7E]/g, "?").trim();

        const nowDate = new Date();
        pdfDoc.setTitle(sanitizeMetadata(`Invoice ${safeOrderId}`));
        pdfDoc.setAuthor(sanitizeMetadata("PDFify"));
        pdfDoc.setSubject(sanitizeMetadata("Invoice"));
        pdfDoc.setCreator(sanitizeMetadata("PDFify API"));
        pdfDoc.setProducer(sanitizeMetadata("PDFify API"));
        pdfDoc.setCreationDate(nowDate);
        pdfDoc.setModificationDate(nowDate);

        const zugferdKey = PDFName.of("ZGFD");
        const metadataKey = PDFName.of("Metadata");

        // Embed the XML file as an embedded file stream
        const embeddedFileStream = pdfDoc.context.flateStream(xmlBuffer, {
          Type: PDFName.of("EmbeddedFile"),
          Subtype: PDFName.of("text#2Fxml"),
        });
        const embeddedFileRef = pdfDoc.context.register(embeddedFileStream);

        const filespecDict = pdfDoc.context.obj({
          Type: PDFName.of("Filespec"),
          F: PDFHexString.fromText("zugferd-invoice.xml"),
          EF: { F: embeddedFileRef },
        });
        const filespecRef = pdfDoc.context.register(filespecDict);

        const namesDict = pdfDoc.catalog.lookupMaybe(PDFName.of("Names")) || pdfDoc.context.obj({});
        namesDict.set(PDFName.of("EmbeddedFiles"), pdfDoc.context.obj({
          Names: [PDFHexString.fromText("zugferd-invoice.xml"), filespecRef],
        }));
        pdfDoc.catalog.set(PDFName.of("Names"), namesDict);

        // Attach the embedded file to the root catalog as a custom entry
        pdfDoc.catalog.set(zugferdKey, filespecRef);

        finalPdfBytes = await pdfDoc.save();
        console.log("✅ ZUGFeRD XML embedded");
      }

      // Save temporary PDF file for Ghostscript validation
      const tmpPdfPath = path.join(tmpDir, `${safeOrderId}-${index}.pdf`);
      fs.writeFileSync(tmpPdfPath, finalPdfBytes);
      console.log(`💾 Saved temporary PDF file: ${tmpPdfPath}`);

      // Ghostscript validation (optional, non-blocking)
      try {
        execSync(`gs -dBATCH -dNOPAUSE -dPDFA=3 -sProcessColorModel=DeviceRGB -sDEVICE=pdfwrite -sOutputFile=/dev/null "${tmpPdfPath}"`);
        console.log(`🛡️ Ghostscript PDF/A-3 validation succeeded for ${safeOrderId}`);
      } catch (gsError) {
        console.warn(`⚠️ Ghostscript validation failed for ${safeOrderId}:`, gsError.message);
      }

      results.push({
        orderId: safeOrderId,
        pdfBase64: finalPdfBytes.toString("base64"),
      });
    }

    // Save user counts and timestamps after processing all
    await user.save();
    console.log("💾 User usage and preview counts saved");

    // Remove tmp dir and files
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log("🧹 Cleaned up temporary files");

    // Respond with all results
    return res.status(200).json({ results });
  } catch (err) {
    console.error("❌ /generate-invoice error:", err);
    try {
      if (browser) await browser.close();
    } catch {}
    return res.status(500).json({ error: "Internal server error" });
  } finally {
    if (browser) await browser.close();
  }
});

module.exports = router;
