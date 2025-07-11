const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const router = express.Router();
const fs = require("fs");
const authenticate = require("../middleware/authenticate");
const dualAuth = require("../middleware/dualAuth");
const User = require("../models/User");
const { generateZugferdXML } = require('../utils/zugferdHelper');
const { PDFDocument, PDFName, PDFHexString  } = require("pdf-lib");






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
                    <td>${item.total || ""}</td>
                  </tr>`
                  )
                  .join("")
              : `<tr><td colspan="4">No items available</td></tr>`
          }
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3">Subtotal</td>
            <td>${data.subtotal}</td>
          </tr>
          <tr>
            <td colspan="3">Tax (21%)</td>
            <td>${data.tax}</td>
          </tr>
          <tr>
            <td colspan="3">Total</td>
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

  const { execSync } = require("child_process");
  const iccPath = process.env.ICC_PROFILE_PATH || path.resolve(__dirname, "../app/sRGB_IEC61966-2-1_no_black_scaling.icc");

  try {
    const gsVersion = execSync("gs --version").toString().trim();
    console.log("📦 Ghostscript version:", gsVersion);
  } catch (err) {
    console.error("❌ Ghostscript not found:", err.message);
    return res.status(500).json({ error: "Ghostscript not installed." });
  }

  if (!fs.existsSync(iccPath)) {
    console.error("❌ ICC profile not found:", iccPath);
    return res.status(500).json({ error: "ICC profile missing." });
  } else {
    console.log("🖨️ ICC profile found:", iccPath);
  }

  let browser;

  try {
    const { data, isPreview } = req.body;
    console.log("📥 Incoming data:", data);

    if (!data || typeof data !== "object") {
      return res.status(400).json({ error: "Invalid or missing data" });
    }

    let invoiceData = { ...data };
    if (typeof invoiceData.items === "string") {
      try {
        invoiceData.items = JSON.parse(invoiceData.items);
      } catch {
        invoiceData.items = [];
      }
    }

    if (!Array.isArray(invoiceData.items)) {
      invoiceData.items = [];
    }

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const now = new Date();
    if (!user.previewLastReset || now.getMonth() !== user.previewLastReset.getMonth()) {
      user.previewCount = 0;
      user.previewLastReset = now;
    }
    if (!user.usageLastReset || now.getMonth() !== user.usageLastReset.getMonth()) {
      user.usageCount = 0;
      user.usageLastReset = now;
    }

    if (!user.isPremium) {
      invoiceData.customLogoUrl = null;
      invoiceData.showChart = false;
      invoiceData.isBasicUser = true;
    } else {
      invoiceData.isBasicUser = false;
    }

    if (isPreview) {
      if (user.planType === "free") {
        if (user.previewCount < 3) {
          user.previewCount += 1;
          console.log("🧪 Free user preview:", user.previewCount);
        } else {
          user.usageCount += 1;
          console.log("⚠️ Exceeded preview limit, counted as usage:", user.usageCount);
        }
      } else {
        console.log("🧪 Preview for premium/pro user — not counted");
      }
    } else {
      user.usageCount += 1;
      console.log("📊 Usage incremented:", user.usageCount);
    }

    await user.save();

    const safeOrderId = invoiceData.orderId || `preview-${Date.now()}`;
    const html = generateInvoiceHTML({ ...invoiceData, isPreview: true });
    console.log("🟣 HTML generated");

    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", bottom: "20mm", left: "10mm", right: "10mm" },
    });

    console.log("📄 Base PDF generated");

    let finalPdfBytes = pdfBuffer;
function sanitizeXmp(xmpString) {
  console.log("📥 Raw XMP string:", xmpString?.substring(0, 200) + "...");
  if (typeof xmpString !== "string") return "";

  // Remove BOM if present
  if (xmpString.charCodeAt(0) === 0xFEFF) xmpString = xmpString.slice(1);

  // Remove invalid XML 1.0 control characters except tab(0x09), newline(0x0A), carriage return(0x0D)
  xmpString = xmpString.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

  // Escape ampersands not part of valid entities
  xmpString = xmpString.replace(/&(?!amp;|lt;|gt;|apos;|quot;)/g, "&amp;");

  // Replace multiple whitespace with single space, then trim
  xmpString = xmpString.replace(/\s+/g, " ").trim();

  console.log("✅ Sanitized XMP string:", xmpString?.substring(0, 200) + "...");
  return xmpString;
}

// Force user.plan to "pro" for testing
if (!user) user = {}; // ensure user object exists
user.plan = "pro";

console.log("🔍 Forced user.plan:", user.plan);

    if (user.plan === "pro") {
      console.log("🧩 Starting ZUGFeRD embedding");

      const zugferdXml = generateZugferdXML(invoiceData);
      const xmlBuffer = Buffer.from(zugferdXml, "utf-8");

      const pdfDoc = await PDFDocument.load(pdfBuffer, { updateMetadata: false });

      const sanitizeMetadata = (str) => String(str || "").replace(/[\r\n\t]+/g, " ").replace(/[^\x20-\x7E]/g, "").trim();
      pdfDoc.setTitle(sanitizeMetadata(`Invoice ${safeOrderId}`));
      pdfDoc.setAuthor(sanitizeMetadata("PDFify User"));
      pdfDoc.setSubject(sanitizeMetadata("ZUGFeRD Invoice"));
      pdfDoc.setProducer(sanitizeMetadata("PDFify API"));
      pdfDoc.setCreator(sanitizeMetadata("PDFify"));
      pdfDoc.setKeywords(["invoice", "zugferd", "pdfa3"]);
      const now = new Date();
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

// Get or create the Names dictionary
let namesDict = catalog.lookup(PDFName.of("Names"));
if (!namesDict) {
  namesDict = pdfDoc.context.obj({});
  catalog.set(PDFName.of("Names"), namesDict);
} else {
  namesDict = namesDict.asDict();
}

// Get or create EmbeddedFiles dictionary inside Names
let embeddedFilesDict = namesDict.lookup(PDFName.of("EmbeddedFiles"));
if (!embeddedFilesDict) {
  embeddedFilesDict = pdfDoc.context.obj({ Names: [] });
  namesDict.set(PDFName.of("EmbeddedFiles"), embeddedFilesDict);
} else {
  embeddedFilesDict = embeddedFilesDict.asDict();
}

// Get or create the Names array inside EmbeddedFiles
let embeddedFilesArray = embeddedFilesDict.lookup(PDFName.of("Names"));
if (!embeddedFilesArray) {
  embeddedFilesArray = pdfDoc.context.obj([]);
  embeddedFilesDict.set(PDFName.of("Names"), embeddedFilesArray);
} else {
  embeddedFilesArray = embeddedFilesArray.asArray();
}

// Add fileName and filespecRef to embeddedFilesArray
embeddedFilesArray.push(PDFHexString.of(fileName));
embeddedFilesArray.push(filespecRef);

// Set the AF array on catalog (Associated Files)
catalog.set(PDFName.of("AF"), pdfDoc.context.obj([filespecRef]));

// The rest remains the same:

const xmpPath = path.resolve(__dirname, "../utils/zugferd.xmp");
const rawXmp = fs.readFileSync(xmpPath, "utf-8");
console.log("📂 Raw XMP loaded");

try {
  const sanitizedXmp = sanitizeXmp(rawXmp);
  const cleanBuffer = Buffer.from(sanitizedXmp, "utf-8");

  const metadataStream = pdfDoc.context.flateStream(cleanBuffer, {
    Type: PDFName.of("Metadata"),
    Subtype: PDFName.of("XML"),
    Filter: PDFName.of("FlateDecode"),
  });

  const metadataRef = pdfDoc.context.register(metadataStream);
  catalog.set(PDFName.of("Metadata"), metadataRef);
  console.log("✅ XMP embedded successfully");
} catch (err) {
  console.error("❌ XMP embedding failed:", err);
}

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
const outputIntentRef = pdfDoc.context.register(outputIntentDict);
catalog.set(PDFName.of("OutputIntents"), pdfDoc.context.obj([outputIntentRef]));

finalPdfBytes = await pdfDoc.save();

    }

    console.log("⚙️ Finalizing with Ghostscript");

const tempInput = `/tmp/input-${Date.now()}.pdf`;
const tempOutput = `/tmp/output-${Date.now()}.pdf`;

fs.writeFileSync(tempInput, finalPdfBytes);
if (!fs.existsSync(iccPath)) throw new Error("ICC profile not found");

await new Promise((resolve, reject) => {
  const { execFile } = require("child_process");

  const args = [
    "-dPDFA=3",
    "-dBATCH",
    "-dNOPAUSE",
    "-sDEVICE=pdfwrite",
    "-dNOOUTERSAVE",
    "-sProcessColorModel=DeviceRGB",
    "-sColorConversionStrategy=RGB",
    "-dEmbedAllFonts=true",
    "-dSubsetFonts=true",
    "-dPreserveDocInfo=false",
    "-dPDFACompatibilityPolicy=1",
    `-sOutputFile=${tempOutput}`,
  ];

  const gsProcess = execFile("gs", args, (error, stdout, stderr) => {
    if (error) {
      console.error("❌ Ghostscript error:", error);
      console.error("🔴 stderr:", stderr);
      return reject(error);
    }

    if (stderr) {
      console.warn("⚠️ Ghostscript stderr:", stderr);
    }

    console.log("✅ Ghostscript completed successfully.");
    resolve();
  });
});

if (!fs.existsSync(tempOutput)) throw new Error("Ghostscript failed to generate output PDF");

// 🔄 First read the Ghostscript output
const gsFinalPdf = fs.readFileSync(tempOutput);

// ✅ Then save it locally for validation
const localValidationPath = path.resolve(__dirname, "pdfs", "latest-invoice.pdf");
fs.mkdirSync(path.dirname(localValidationPath), { recursive: true });
fs.writeFileSync(localValidationPath, gsFinalPdf);
console.log("📥 Copied PDF for local VeraPDF validation.");

const sanitizeFileName = (name) => name.replace(/[^a-zA-Z0-9_\-\.]/g, "_");
const safeFileName = sanitizeFileName(`Invoice_${safeOrderId}_pdfa3.pdf`);

res.set({
  "Content-Type": "application/pdf",
  "Content-Disposition": `attachment; filename=${safeFileName}`,
  "Content-Length": gsFinalPdf.length,
});

console.log("📤 Sending finalized PDF.");
return res.send(gsFinalPdf);

} catch (error) {
  console.error("❌ Error generating invoice PDF:", error);
  return res.status(500).json({ error: "Internal server error" });
} finally {
  if (browser) {
    await browser.close();
    console.log("🧹 Puppeteer browser closed.");
  }
}
});

module.exports = router;