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

router.post("/generate-invoice", upload.none(), async (req, res) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "invoice-"));
  let browser;

  try {
    const { payload } = req.body;
    const { data, token } = JSON.parse(payload);
    const invoices = Array.isArray(data) ? data : [data];

    const user = await User.findOne({ token });
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const results = [];
    browser = await puppeteer.launch({ headless: "new" });

    for (let index = 0; index < invoices.length; index++) {
      const invoiceData = invoices[index];
      const safeOrderId = invoiceData.orderId?.replace(/[^a-zA-Z0-9_-]/g, "") || `INV-${Date.now()}`;
      const htmlContent = await generateHTML(invoiceData);
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: "networkidle0" });
      const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
      await page.close();

      let finalPdfBytes = pdfBuffer;
      const now = new Date();

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
        catalog.set(PDFName.of("OutputIntents"), pdfDoc.context.obj([pdfDoc.context.register(outputIntentDict)]));

        finalPdfBytes = await pdfDoc.save();
        console.log(`✅ PDF with embedded XML and metadata generated, size: ${finalPdfBytes.length} bytes`);
      }

      const tempInput = path.join(tmpDir, `input-${index}.pdf`);
      const tempOutput = path.join(tmpDir, `output-${index}.pdf`);
      console.log(`💾 Writing PDF input file: ${tempInput}`);
      fs.writeFileSync(tempInput, finalPdfBytes);

      const gsArgs = [
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
        tempInput,
      ];

      console.log("🚨 Running Ghostscript for PDF/A-3 conversion...");
      await new Promise((resolve, reject) => {
        execFile("gs", gsArgs, (err) => {
          if (err) {
            console.error("❌ Ghostscript failed:", err);
            reject(err);
          } else {
            console.log("✅ Ghostscript finished successfully");
            resolve();
          }
        });
      });

      console.log(`📁 Reading final PDF output from: ${tempOutput}`);
      const finalPdf = fs.readFileSync(tempOutput);

      results.push({ index, pdf: finalPdf });
    }

    if (results.length === 1) {
      console.log("📤 Sending single PDF response");
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename=invoice.pdf`,
        "Content-Length": results[0].pdf.length,
      });
      res.send(results[0].pdf);
    } else {
      console.log("🗜️ Zipping multiple PDFs for response");
      const archive = archiver("zip", { zlib: { level: 9 } });
      res.set({
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename=invoices.zip`,
      });
      archive.pipe(res);
      results.forEach(({ index, pdf }) => {
        archive.append(pdf, { name: `invoice-${index + 1}.pdf` });
      });
      await archive.finalize();
    }


    // Usage tracking
if (isPreview) {
  user.previewCount += 1;
  console.log(`👁️ Preview generated. Total previews: ${user.previewCount}`);
} else {
  user.usageCount += results.length;
  console.log(`📈 Final invoices generated: ${results.length}. Total usage: ${user.usageCount}`);
}

await user.save();
console.log("💾 User usage data saved:", {
  usageCount: user.usageCount,
  previewCount: user.previewCount,
});


    await user.save();
    console.log("💾 User usage data saved:", { usageCount: user.usageCount, previewCount: user.previewCount });
  } catch (e) {
    console.error("❌ Exception in /generate-invoice:", e);
    res.status(500).json({ error: "Internal Server Error", details: e.message });
  } finally {
    if (browser) {
      console.log("🧹 Closing Puppeteer browser...");
      await browser.close();
    }
    console.log("🧹 Cleaning up temporary directory...");
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

module.exports = router;
