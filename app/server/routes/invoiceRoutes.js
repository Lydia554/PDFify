const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const router = express.Router();
const fs = require("fs");
const authenticate = require("../middleware/authenticate");
const dualAuth = require("../middleware/dualAuth");
const User = require("../models/User");
const pdfParse = require("pdf-parse");
const { generateZugferdXML } = require('../utils/zugferdHelper');
const { exec } = require("child_process");
const { PDFDocument, PDFName, PDFString } = require("pdf-lib");





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
        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.08);
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
        color: rgba(255, 0, 0, 0.1);
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

    const safeOrderId = invoiceData.orderId || `preview-${Date.now()}`;
    const pdfDir = path.join(__dirname, "../pdfs");
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

    // 1) Generate ZUGFeRD XML
    const zugferdXml = generateZugferdXML(invoiceData);
    const xmlBuffer = Buffer.from(zugferdXml, "utf-8");

    // 2) Generate PDF with Puppeteer
    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();

    if (!user.isPremium) {
      invoiceData.customLogoUrl = null;
      invoiceData.showChart = false;
      invoiceData.isBasicUser = true;
    } else {
      invoiceData.isBasicUser = false;
    }

    const html = generateInvoiceHTML({ ...invoiceData, isPreview });
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfPath = path.join(pdfDir, `Invoice_${safeOrderId}.pdf`);
    const pdfa3PdfPath = path.join(pdfDir, `Invoice_${safeOrderId}_pdfa3.pdf`);

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

    // 3) Embed ZUGFeRD XML in PDF using pdf-lib
    const pdfDoc = await PDFDocument.load(pdfBuffer);

    const embeddedFileStream = pdfDoc.context.flateStream(xmlBuffer, {
      Type: PDFName.of("EmbeddedFile"),
      Subtype: PDFName.of("application/xml"),
    });

    // Add /Params dictionary
    embeddedFileStream.set(
      PDFName.of("Params"),
      pdfDoc.context.obj({
        Size: xmlBuffer.length,
        ModDate: PDFString.fromDate(new Date()),
      })
    );

    const embeddedFileRef = pdfDoc.context.register(embeddedFileStream);

    const efDict = pdfDoc.context.obj({
      F: embeddedFileRef,
      UF: embeddedFileRef,
    });

    const fileName = "zugferd-invoice.xml";
    const filespecDict = pdfDoc.context.obj({
      Type: PDFName.of("Filespec"),
      F: PDFString.of(fileName),
      UF: PDFString.of(fileName),
      EF: efDict,
      Desc: PDFString.of("ZUGFeRD invoice XML"),
      AFRelationship: PDFName.of("Data"),
    });
    const filespecRef = pdfDoc.context.register(filespecDict);

    // Ensure /Names → /EmbeddedFiles is set
    const catalog = pdfDoc.catalog;
    const namesDict = catalog.lookupMaybe(PDFName.of("Names"))?.asDict() || pdfDoc.context.obj({});
    const embeddedFilesDict = namesDict.lookupMaybe(PDFName.of("EmbeddedFiles"))?.asDict() || pdfDoc.context.obj({
      Names: [],
    });
    const embeddedFilesArray = embeddedFilesDict.lookup(PDFName.of("Names"))?.asArray() || [];

    embeddedFilesArray.push(PDFString.of(fileName), filespecRef);
    embeddedFilesDict.set(PDFName.of("Names"), embeddedFilesArray);
    namesDict.set(PDFName.of("EmbeddedFiles"), embeddedFilesDict);
    catalog.set(PDFName.of("Names"), namesDict);

    // Set /AF entry
    const afArray = pdfDoc.context.obj([filespecRef]);
    catalog.set(PDFName.of("AF"), afArray);

    // Merge XMP metadata
    const existingXmp = pdfDoc.getXmpMetadata() || "";
    const mergedXmp = `
<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    ${existingXmp.split("</rdf:RDF>")[0] || ""}
    <rdf:Description xmlns:zf="urn:ferd:pdfa:CrossIndustryDocument:invoice:1p0#"
      zf:ConformanceLevel="BASIC"
      zf:DocumentFileName="${fileName}"
      zf:DocumentType="INVOICE"
      zf:Version="1.0"/>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`.trim();

    await pdfDoc.setXmpMetadata(mergedXmp);
    const pdfWithXmlBuffer = await pdfDoc.save();
    fs.writeFileSync(pdfPath, pdfWithXmlBuffer);

    // 4) Ghostscript PDF/A-3b conversion
const iccProfilePath = process.env.ICC_PROFILE_PATH
  ? path.resolve(process.env.ICC_PROFILE_PATH)
  : path.resolve(__dirname, "../app/sRGB_IEC61966-2-1_no_black_scaling.icc");

const gsCmd = `
  gs -dPDFA=3 -dBATCH -dNOPAUSE -dNOOUTERSAVE \
  -sColorConversionStrategy=RGB \
  -sProcessColorModel=DeviceRGB \
  -sDEVICE=pdfwrite \
  -sPDFACompatibilityPolicy=1 \
  -dUseCIEColor \
  -sOutputICCProfile="${iccProfilePath.replace(/"/g, '\\"')}" \
  -sOutputFile="${pdfa3PdfPath.replace(/"/g, '\\"')}" "${pdfPath.replace(/"/g, '\\"')}"
`;
    await new Promise((resolve, reject) => {
      exec(gsCmd, (error, stdout, stderr) => {
        if (error) {
          console.error("Ghostscript error:", error);
          return reject(error);
        }
        resolve();
      });
    });

    // 5) Count pages and enforce limits
    const finalPdfBytes = fs.readFileSync(pdfa3PdfPath);
    const parsed = await pdfParse(finalPdfBytes);
    const pageCount = parsed.numpages;

    if (isPreview) {
      if (!user.isPremium) {
        if (user.previewCount < 3) {
          user.previewCount += 1;
        } else {
          if (user.usageCount + pageCount > user.maxUsage) {
            fs.unlinkSync(pdfPath);
            fs.unlinkSync(pdfa3PdfPath);
            return res.status(403).json({ error: "Monthly usage limit reached." });
          }
          user.usageCount += pageCount;
        }
      }
    } else {
      if (!user.isPremium && user.usageCount + pageCount > user.maxUsage) {
        fs.unlinkSync(pdfPath);
        fs.unlinkSync(pdfa3PdfPath);
        return res.status(403).json({ error: "Monthly usage limit reached." });
      }
      user.usageCount += pageCount;
    }
    await user.save();

    // 6) Send response
    res.download(pdfa3PdfPath, (err) => {
      if (err) console.error("Download error:", err);
      [pdfPath, pdfa3PdfPath].forEach((file) => {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      });
    });
  } catch (error) {
    console.error("Error generating invoice:", error);
    return res.status(500).json({ error: "Internal server error" });
  } finally {
    if (browser) await browser.close();
  }
});

module.exports = router;