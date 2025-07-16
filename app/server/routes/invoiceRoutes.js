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
  Number(String(data.subtotal).replace(/[^\d.-]/g, '')) || 0,
Number(String(data.tax).replace(/[^\d.-]/g, '')) || 0,

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

  // Path to ICC profile for PDF/A compliance
  const iccPath =
    process.env.ICC_PROFILE_PATH ||
    path.resolve(__dirname, "../app/sRGB_IEC61966-2-1_no_black_scaling.icc");
  console.log("🔍 Using ICC profile path:", iccPath);

  // Check Ghostscript availability for PDF/A conversion
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
  }

  // Create a temp directory to hold PDFs during processing
  const tmpDir = path.join("/tmp", `pdfify-batch-${Date.now()}`);
  console.log("📁 Creating temporary directory:", tmpDir);
  fs.mkdirSync(tmpDir, { recursive: true });

  // Usage increment function with preview and plan logic
  function incrementUsage(user, isPreview, pageCount, forcedPlan) {
    const plan = (forcedPlan || user.plan || "").toLowerCase();

    if (isPreview && plan === "free") {
      if (user.previewCount < 3) {
        user.previewCount++;
        console.log(`👀 Incremented preview count to ${user.previewCount}`);
      } else {
        user.usageCount += pageCount;
        console.log(
          `⚠️ Preview limit reached, incremented usage count by ${pageCount} to ${user.usageCount}`
        );
      }
    } else if (["premium", "pro"].includes(plan)) {
      user.usageCount += pageCount;
      console.log(`🔥 Incremented usage count by ${pageCount} for plan ${plan}`);
    } else if (!isPreview) {
      user.usageCount += pageCount;
      console.log(
        `💡 Incremented usage count by ${pageCount} for plan ${plan} (non-preview)`
      );
    } else {
      console.warn(`⚠️ Unknown plan or state, no usage increment.`);
    }
  }

  try {
    // Validate and normalize requests array (1–100)
    let requests = req.body.requests;
    if (!Array.isArray(requests)) {
      if (req.body.data) {
        requests = [{ data: req.body.data, isPreview: req.body.isPreview || false }];
        console.log("📩 Converted single request to array");
      } else {
        return res.status(400).json({ error: "You must send 1-100 requests." });
      }
    }

    if (requests.length === 0 || requests.length > 100) {
      return res.status(400).json({ error: "You must send 1-100 requests." });
    }

    console.log("🔢 Number of invoice requests to process:", requests.length);

    // Load user info from DB to access plan and usage counts
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    console.log("👤 User found:", user._id, "plan:", user.plan);

    // Reset preview and usage counts monthly
    const now = new Date();
    if (
      !user.previewLastReset ||
      now.getMonth() !== user.previewLastReset.getMonth() ||
      now.getFullYear() !== user.previewLastReset.getFullYear()
    ) {
      user.previewCount = 0;
      user.previewLastReset = now;
      console.log("🔄 Preview count reset for new month");
    }
    if (
      !user.usageLastReset ||
      now.getMonth() !== user.usageLastReset.getMonth() ||
      now.getFullYear() !== user.usageLastReset.getFullYear()
    ) {
      user.usageCount = 0;
      user.usageLastReset = now;
      console.log("🔄 Usage count reset for new month");
    }

    // Dev-only forced plan override (ignored in production)
    const isDev = process.env.NODE_ENV !== "production";
    const forcedPlan = isDev && req.body.forcedPlan ? req.body.forcedPlan.toLowerCase() : null;
    if (!isDev && req.body.forcedPlan) {
      console.warn("⚠️ Forced plan override ignored in production mode");
    }
    if (forcedPlan) {
      console.log(`🧪 DEV MODE: Forced plan override: ${forcedPlan}`);
    }

    // Launch Puppeteer browser instance
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    // Store results to respond with PDFs and page counts
    const results = [];

    for (const [index, { data, isPreview = false }] of requests.entries()) {
      console.log(`📝 Processing request #${index + 1}`);

      // Validate incoming invoice data object
      if (!data || typeof data !== "object") {
        results.push({ error: "Invalid or missing data" });
        continue;
      }

      // Normalize country (default Slovenia)
      const invoiceData = { ...data };
      const country = (invoiceData.country || "slovenia").toLowerCase();
      invoiceData.country = country;

      // Parse and sanitize invoice items if sent as JSON string
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

      // Calculate item-level VAT and net for Germany
      if (country === "germany" && Array.isArray(invoiceData.items)) {
        console.log("🇩🇪 Calculating German VAT for items");
        const taxRate = 0.19; // 19% VAT Germany
        invoiceData.items = invoiceData.items.map((item, i) => {
          const totalNum = parseSafeNumber(item.total);
          const net = totalNum / (1 + taxRate);
          const taxAmount = totalNum - net;
          console.log(
            `  Item #${i + 1}: total=${totalNum}, net=${net.toFixed(
              2
            )}, tax=${taxAmount.toFixed(2)}`
          );
          return {
            ...item,
            tax: taxAmount.toFixed(2),
            net: net.toFixed(2),
          };
        });
      }

      // Basic user restrictions (no logo, no charts)
      invoiceData.isBasicUser = !user.isPremium;
      if (!user.isPremium) {
        invoiceData.customLogoUrl = null;
        invoiceData.showChart = false;
      }

      // Unique order ID fallback
      const safeOrderId = invoiceData.orderId || `invoice-${Date.now()}-${index}`;
      console.log(`🆔 Using orderId: ${safeOrderId}`);

      // Generate invoice HTML (your function returns string HTML)
      console.log("🧾 Generating HTML for invoice...");
      const html = await generateInvoiceHTML({ ...invoiceData, isPreview });
      if (!html || typeof html !== "string") {
        console.error("❌ generateInvoiceHTML returned invalid content");
        results.push({ error: "Failed to generate invoice HTML" });
        continue;
      }
      console.log(`✅ Generated HTML length: ${html.length}`);

      // Puppeteer render PDF buffer
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      await page.emulateMediaType("screen");

      // PDF options, embed ICC profile for PDF/A compliance
      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
      });
      await page.close();

      // Save PDF to tmp
      const pdfPath = path.join(tmpDir, `${safeOrderId}.pdf`);
      fs.writeFileSync(pdfPath, pdfBuffer);
      console.log(`💾 PDF saved to ${pdfPath}`);

      // Get page count for usage and further processing
      const pageCount = await getPdfPageCount(pdfBuffer);
      console.log(`📄 PDF page count: ${pageCount}`);

      // Usage counting
      incrementUsage(user, isPreview, pageCount, forcedPlan);

      // If user is Pro and not preview, embed ZUGFeRD XML and metadata
      if (user.plan?.toLowerCase() === "pro" && !isPreview) {
        console.log("⚙️ Embedding ZUGFeRD XML and metadata for Pro user...");

        const zugferdXml = await generateZugferdXML(invoiceData);
        // Load PDF with pdf-lib
        const pdfDoc = await PDFDocument.load(pdfBuffer);

        // Attach ZUGFeRD XML as embedded file
        const embeddedFile = await pdfDoc.attach(
          Buffer.from(zugferdXml, "utf-8"),
          "zugferd-invoice.xml",
          {
            mimeType: "application/xml",
            description: "ZUGFeRD invoice XML",
            creationDate: new Date(),
          }
        );

        // Add XMP metadata (example minimal, extend as needed)
        const xmpString = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
          <x:xmpmeta xmlns:x="adobe:ns:meta/">
            <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
              <rdf:Description rdf:about=""
                xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"
                pdfaid:part="3"
                pdfaid:conformance="B"/>
            </rdf:RDF>
          </x:xmpmeta>
          <?xpacket end="w"?>`;

        pdfDoc.setXmpMetadata(xmpString);

        const pdfBytes = await pdfDoc.save();

        // Overwrite original PDF with embedded ZUGFeRD PDF
        fs.writeFileSync(pdfPath, pdfBytes);
        console.log("📎 ZUGFeRD XML and XMP metadata embedded");
      }

      // Ghostscript convert to PDF/A-3 and validate
      const pdfA3Path = path.join(tmpDir, `${safeOrderId}-pdfa3.pdf`);
      try {
        const gsArgs = [
          "-dPDFA=3",
          "-dBATCH",
          "-dNOPAUSE",
          "-dNOOUTERSAVE",
          "-sProcessColorModel=DeviceRGB",
          "-sDEVICE=pdfwrite",
          "-sPDFACompatibilityPolicy=1",
          `-sOutputFile=${pdfA3Path}`,
          `-dEmbedAllFonts=true`,
          `-dSubsetFonts=true`,
          `-dCompressFonts=true`,
          `-dUseCIEColor=true`,
          `-dAutoRotatePages=/None`,
          `-dColorConversionStrategy=/sRGB`,
          `-dColorConversionStrategyForImages=/sRGB`,
          `-dDownsampleColorImages=false`,
          `-dDownsampleGrayImages=false`,
          `-dDownsampleMonoImages=false`,
          `-dPrinted=false`,
          `-dPDFACompatibilityPolicy=1`,
          `-sOutputICCProfile=${iccPath}`,
          pdfPath,
        ];

        execFileSync("gs", gsArgs);
        console.log(`✔️ Ghostscript PDF/A-3 conversion done: ${pdfA3Path}`);
      } catch (gsErr) {
        console.error("❌ Ghostscript PDF/A-3 conversion failed:", gsErr.message);
        // fallback: use original pdfPath if conversion failed
      }

      // Add final file path to results
      const finalPdfPath = fs.existsSync(pdfA3Path) ? pdfA3Path : pdfPath;
      results.push({ path: finalPdfPath, fileName: `${safeOrderId}.pdf`, pageCount });
    }

    await browser.close();

    // Save usage increments to user document
    await user.save();

    // If single invoice, send PDF directly
    if (results.length === 1 && !results[0].error) {
      const filePath = results[0].path;
      console.log(`📤 Sending single PDF file: ${filePath}`);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${results[0].fileName}"`
      );
      fs.createReadStream(filePath).pipe(res);
      // Cleanup temp after stream ends
      res.on("finish", () => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        console.log(`🧹 Cleaned temp directory: ${tmpDir}`);
      });
    } else {
      // Multiple PDFs => zip them
      console.log("🗜️ Creating ZIP archive for multiple PDFs...");
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", "attachment; filename=invoices.zip");

      const archive = archiver("zip");
      archive.pipe(res);

      results.forEach(({ path: pdfPath, fileName }) => {
        if (pdfPath && fs.existsSync(pdfPath)) {
          archive.file(pdfPath, { name: fileName });
        }
      });

      archive.finalize();

      res.on("finish", () => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        console.log(`🧹 Cleaned temp directory: ${tmpDir}`);
      });
    }
  } catch (error) {
    console.error("❌ /generate-invoice error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;