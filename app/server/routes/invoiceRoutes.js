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
const { execFile } = require("child_process");





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
      /* common styles */
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
        box-shadow: 0 8px 25px  #2a3d66;
        border-radius: 16px;
        border: 1px solid #e0e4ec;
        position: relative;
        z-index: 1;
      }

      /* Table styles for PREMIUM users */
      .premium .table {
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

      /* Table styles for BASIC users */
      .basic .table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 20px;
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

      /* Watermark styles */
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


    const now = new Date();
    if (
      !user.previewLastReset ||
      now.getMonth() !== user.previewLastReset.getMonth() ||
      now.getFullYear() !== user.previewLastReset.getFullYear()
    ) {
      user.previewCount = 0;
      user.previewLastReset = now;
    }
    if (
      !user.usageLastReset ||
      now.getMonth() !== user.usageLastReset.getMonth() ||
      now.getFullYear() !== user.usageLastReset.getFullYear()
    ) {
      user.usageCount = 0;
      user.usageLastReset = now;
    }
    await user.save();

    const safeOrderId = invoiceData.orderId || `preview-${Date.now()}`;
    const pdfDir = path.join(__dirname, "../pdfs");
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

   
    if (!user.isPremium) {
      invoiceData.customLogoUrl = null;
      invoiceData.showChart = false;
      invoiceData.isBasicUser = true;
    } else {
      invoiceData.isBasicUser = false;
    }

 // 1) Generate base PDF with Puppeteer
    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();

    const html = generateInvoiceHTML({ ...invoiceData, isPreview: true });
    console.log("🟣 HTML generated for invoice.");

    await page.setContent(html, { waitUntil: "networkidle0" });
    console.log("🟢 HTML content loaded in Puppeteer.");

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `<div></div>`,
      footerTemplate: `
        <div style="font-size:10px; width:100%; text-align:center; color:#888; padding:5px 10px;">
          Page <span class="pageNumber"></span> of <span class="totalPages"></span>
        </div>`,
      margin: { top: "20mm", bottom: "20mm", left: "10mm", right: "10mm" },
    });

    console.log("📄 Base PDF created via Puppeteer.");
    let finalPdfBytes = pdfBuffer;

    // 2) If PRO user, embed ZUGFeRD XML and metadata
    if (user.plan === "pro") {
      console.log("🧩 PRO user detected — embedding ZUGFeRD metadata.");

      const zugferdXml = generateZugferdXML(invoiceData);
      const xmlBuffer = Buffer.from(zugferdXml, "utf-8");
      const pdfDoc = await PDFDocument.load(pdfBuffer);

      // Set PDF metadata
      pdfDoc.setTitle(`Invoice ${invoiceData.orderId || ""}`);
      pdfDoc.setSubject("ZUGFeRD Invoice");
      pdfDoc.setKeywords(["invoice", "ZUGFeRD", "PDF/A-3"]);
      pdfDoc.setProducer("PDFify API");
      pdfDoc.setCreator("PDFify");
      pdfDoc.setCreationDate(new Date());
      pdfDoc.setModificationDate(new Date());
      console.log("📌 PDF metadata set.");

      // Embed XML
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
      console.log("📎 ZUGFeRD XML embedded.");

      // Embed XMP Metadata
      const xmpPath = path.resolve(__dirname, "../utils/zugferd.xmp");
      const mergedXmp = fs.readFileSync(xmpPath, "utf-8");
      await pdfDoc.setXmpMetadata(mergedXmp);
      console.log("🧠 XMP metadata set.");

      const metadataStream = pdfDoc.context.flateStream(Buffer.from(mergedXmp, "utf8"), {
        Type: PDFName.of("Metadata"),
        Subtype: PDFName.of("XML"),
        Filter: PDFName.of("FlateDecode"),
      });
      const metadataRef = pdfDoc.context.register(metadataStream);
      catalog.set(PDFName.of("Metadata"), metadataRef);

      // Add OutputIntent (ICC)
      const iccProfilePath = process.env.ICC_PROFILE_PATH || path.resolve(__dirname, "../app/sRGB_IEC61966-2-1_no_black_scaling.icc");
      const iccData = fs.readFileSync(iccProfilePath);
      const iccStream = pdfDoc.context.flateStream(iccData, {
        N: 3,
        Alternate: PDFName.of("DeviceRGB"),
        Filter: PDFName.of("FlateDecode"),
      });
      const iccRef = pdfDoc.context.register(iccStream);
      const outputIntentDict = pdfDoc.context.obj({
        Type: PDFName.of("OutputIntent"),
        S: PDFName.of("GTS_PDFA1"),
        OutputConditionIdentifier: PDFHexString.fromString("sRGB IEC61966-2.1"),
        Info: PDFHexString.fromString("sRGB IEC61966-2.1"),
        DestOutputProfile: iccRef,
      });
      const outputIntentRef = pdfDoc.context.register(outputIntentDict);
      catalog.set(PDFName.of("OutputIntents"), pdfDoc.context.obj([outputIntentRef]));
      console.log("🎨 ICC OutputIntent embedded.");

      finalPdfBytes = await pdfDoc.save();
      console.log("📥 PRO PDF saved with metadata.");
    }

    // 3) Finalize PDF/A-3 via Ghostscript
    console.log("⚙️ Finalizing via Ghostscript...");
    const tempInput = `/tmp/input-${Date.now()}.pdf`;
    const tempOutput = `/tmp/output-${Date.now()}.pdf`;
    const iccPath = process.env.ICC_PROFILE_PATH || path.resolve(__dirname, "../sRGB_IEC61966-2-1_no_black_scaling.icc");

    fs.writeFileSync(tempInput, finalPdfBytes);
    if (!fs.existsSync(iccPath)) throw new Error("ICC profile not found");

    await new Promise((resolve, reject) => {
      const gsProcess = execFile(
        "gs",
        [
          "-dPDFA=3",
          "-dBATCH",
          "-dNOPAUSE",
          "-dPreserveMetadata",
          "-sDEVICE=pdfwrite",
          "-sProcessColorModel=DeviceRGB",
          "-sColorConversionStrategy=RGB",
          "-dEmbedAllFonts=true",
          "-dSubsetFonts=true",
          "-sPDFACompatibilityPolicy=1",
          `-sOutputIntentProfile=${iccPath}`,
          `-sOutputFile=${tempOutput}`,
          tempInput,
        ],
        (error) => (error ? reject(error) : resolve())
      );
    });

    if (!fs.existsSync(tempOutput)) throw new Error("Ghostscript did not produce an output file");
    const gsFinalPdf = fs.readFileSync(tempOutput);
    console.log("✅ Ghostscript finalized PDF/A-3.");

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=Invoice_${safeOrderId}_pdfa3.pdf`,
      "Content-Length": gsFinalPdf.length,
    });
    console.log("📤 Sending PDF response.");
    return res.send(gsFinalPdf);

  } catch (error) {
    console.error("❌ Error generating invoice PDF:", error);
    return res.status(500).json({ error: "Internal server error" });
  } finally {
    if (browser) {
      await browser.close();
      console.log("🧹 Browser closed.");
    }
  }
});

module.exports = router;