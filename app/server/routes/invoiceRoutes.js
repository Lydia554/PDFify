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
  /* PDF/A-2b compliant override */
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
  let browser;
  try {
    let { data, isPreview } = req.body;
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

    // Reset counts monthly
    const now = new Date();
    if (!user.previewLastReset || now.getMonth() !== user.previewLastReset.getMonth() || now.getFullYear() !== user.previewLastReset.getFullYear()) {
      user.previewCount = 0;
      user.previewLastReset = now;
    }
    if (!user.usageLastReset || now.getMonth() !== user.usageLastReset.getMonth() || now.getFullYear() !== user.usageLastReset.getFullYear()) {
      user.usageCount = 0;
      user.usageLastReset = now;
    }

    // Set invoice flags based on plan
    if (!user.isPremium) {
      invoiceData.customLogoUrl = null;
      invoiceData.showChart = false;
      invoiceData.isBasicUser = true;
    } else {
      invoiceData.isBasicUser = false;
    }

// Count usage
if (isPreview) {
  if (user.planType === "free") {
    if (user.previewCount < 3) {
      user.previewCount += 1;
      console.log("🧪 Free user preview incremented:", user.previewCount);
    } else {
      user.usageCount += 1;
      console.log("⚠️ Free user exceeded preview limit, counting as usage:", user.usageCount);
    }
  } else {
    console.log("🧪 Preview for premium/pro user — not counted.");
  }
} else {
  user.usageCount += 1;
  console.log("📊 Usage (non-preview) incremented:", user.usageCount);
}

    await user.save();

    const safeOrderId = invoiceData.orderId || `preview-${Date.now()}`;

    // Generate base HTML
    const html = generateInvoiceHTML({ ...invoiceData, isPreview: true });
    console.log("🟣 HTML generated.");

    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
       displayHeaderFooter: false,
      headerTemplate: `<div></div>`,
      footerTemplate: `
        <div style="font-size:10px; width:100%; text-align:center; color:#888; padding:5px 10px;">
          Page <span class="pageNumber"></span> of <span class="totalPages"></span>
        </div>`,
      margin: { top: "20mm", bottom: "20mm", left: "10mm", right: "10mm" },
    });

    console.log("📄 Base PDF generated.");

    let finalPdfBytes = pdfBuffer;

if (user.plan === "pro") {
  console.log("🧩 Embedding ZUGFeRD metadata...");
  const zugferdXml = generateZugferdXML(invoiceData);
  const xmlBuffer = Buffer.from(zugferdXml, "utf-8");
 

const pdfDoc = await PDFDocument.load(pdfBuffer, {
  updateMetadata: false,
});

// Clear any existing metadata
pdfDoc.setTitle("");
pdfDoc.setSubject("");
pdfDoc.setProducer("");
pdfDoc.setCreator("");
pdfDoc.setKeywords([]);

// 🧼 Extra safety: remove raw Info dict
const infoDictRef = pdfDoc.context.trailer.get(PDFName.of("Info"));
if (infoDictRef) {
  const infoDict = infoDictRef.lookupMaybe()?.asDict?.();
  if (infoDict) {
    const keys = infoDict.keys();
    for (const key of keys) {
      infoDict.delete(key);
    }
  }
  pdfDoc.context.trailer.delete(PDFName.of("Info"));
}


// Now set clean ASCII metadata
const sanitizeMetadata = (str) =>
  String(str || "").replace(/[^\x20-\x7E]/g, "");

pdfDoc.setTitle(sanitizeMetadata(`Invoice ${safeOrderId}`));
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
      embeddedFileStream.set(PDFName.of("Params"), pdfDoc.context.obj({
        Size: xmlBuffer.length,
        ModDate: PDFHexString.fromDate(new Date()),
      }));
      const embeddedFileRef = pdfDoc.context.register(embeddedFileStream);

      const fileName = "zugferd-invoice.xml";
      const efDict = pdfDoc.context.obj({ F: embeddedFileRef, UF: embeddedFileRef });
      const filespecDict = pdfDoc.context.obj({
        Type: PDFName.of("Filespec"),
        F: PDFHexString.fromString(fileName),
        UF: PDFHexString.fromString(fileName),
        EF: efDict,
        Desc: PDFHexString.fromString("ZUGFeRD invoice XML"),
        AFRelationship: PDFName.of("Data"),
      });
      const filespecRef = pdfDoc.context.register(filespecDict);

      const catalog = pdfDoc.catalog;
      const namesDict = catalog.lookupMaybe(PDFName.of("Names"))?.asDict() || pdfDoc.context.obj({});
      const embeddedFilesDict = namesDict.lookupMaybe(PDFName.of("EmbeddedFiles"))?.asDict() || pdfDoc.context.obj({ Names: [] });
      const embeddedFilesArray = embeddedFilesDict.lookupMaybe(PDFName.of("Names"))?.asArray() || [];
      embeddedFilesArray.push(PDFHexString.fromString(fileName), filespecRef);
      embeddedFilesDict.set(PDFName.of("Names"), embeddedFilesArray);
      namesDict.set(PDFName.of("EmbeddedFiles"), embeddedFilesDict);
      catalog.set(PDFName.of("Names"), namesDict);
      catalog.set(PDFName.of("AF"), pdfDoc.context.obj([filespecRef]));

      const xmpPath = path.resolve(__dirname, "../utils/zugferd.xmp");
      const mergedXmp = fs.readFileSync(xmpPath, "utf-8");
      await pdfDoc.setXmpMetadata(mergedXmp);

      const metadataStream = pdfDoc.context.flateStream(Buffer.from(mergedXmp, "utf8"), {
        Type: PDFName.of("Metadata"),
        Subtype: PDFName.of("XML"),
        Filter: PDFName.of("FlateDecode"),
      });
      const metadataRef = pdfDoc.context.register(metadataStream);
      catalog.set(PDFName.of("Metadata"), metadataRef);


      const iccData = fs.readFileSync(iccProfilePath);
      const iccStream = pdfDoc.context.flateStream(iccData, {
        N: 3,
        Alternate: PDFName.of("DeviceRGB"),
        Filter: PDFName.of("FlateDecode"),
      });
      const iccRef = pdfDoc.context.register(iccStream);
      const outputIntentDict = pdfDoc.context.obj({
        Type: PDFName.of("OutputIntent"),
        S: PDFName.of("GTS_PDFA3"),
        OutputConditionIdentifier: PDFHexString.fromString("sRGB IEC61966-2.1"),
        Info: PDFHexString.fromString("sRGB IEC61966-2.1"),
        DestOutputProfile: iccRef,
      });
      const outputIntentRef = pdfDoc.context.register(outputIntentDict);
      catalog.set(PDFName.of("OutputIntents"), pdfDoc.context.obj([outputIntentRef]));

      finalPdfBytes = await pdfDoc.save();
    }


    console.log("⚙️ Finalizing via Ghostscript...");
    const tempInput = `/tmp/input-${Date.now()}.pdf`;
    const tempOutput = `/tmp/output-${Date.now()}.pdf`;
    const iccPath = process.env.ICC_PROFILE_PATH || path.resolve(__dirname, "..app/sRGB_IEC61966-2-1_no_black_scaling.icc");

    fs.writeFileSync(tempInput, finalPdfBytes);
    if (!fs.existsSync(iccPath)) throw new Error("ICC profile not found");

   await new Promise((resolve, reject) => {
  const { execFile } = require("child_process");

  const args = [
    "-dPDFA=3",
    "-dBATCH",
    "-dNOPAUSE",
    "-dPreserveMetadata",
    "-sDEVICE=pdfwrite",
    "-sProcessColorModel=DeviceRGB",
    "-sColorConversionStrategy=RGB",
    "-dEmbedAllFonts=true",
    "-dSubsetFonts=true",
    "-dPreserveDocInfo=false",
    -"dProcessColorModel=/DeviceCMYK -dCompatibilityLevel=1.7",

    "-sPDFACompatibilityPolicy=1",
    `-sOutputIntentProfile=${iccPath}`,
    `-sOutputFile=${tempOutput}`,
    tempInput,
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
fs.mkdirSync(path.dirname(localValidationPath), { recursive: true }); // ensure pdfs/ exists
fs.writeFileSync(localValidationPath, gsFinalPdf);
console.log("📥 Copied PDF for local VeraPDF validation.");


const sanitizeFileName = (name) =>
  name.replace(/[^a-zA-Z0-9_\-\.]/g, "_");
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