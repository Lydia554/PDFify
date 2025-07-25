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
const embedXmp = require("../xmp/embedXmp");
const { PDFDocument, PDFName, PDFHexString } = require("pdf-lib");
const { execSync, execFile } = require("child_process");
const { incrementUsage } = require("../utils/usageUtils");



const locales = {
  sl: require('../../locales/sl.json'),
  en: require('../../locales/en.json'),
  de: require('../../locales/de.json'),
  
};


const { generateInvoiceHTML: generateEnglishInvoice } = require("../../templates/english.js");


const log = (message, data = null) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(message, data);
  }
};


  const FORCE_PLAN = process.env.FORCE_PLAN;

router.post("/generate-invoice", authenticate, dualAuth, async (req, res) => {
  console.log("🌐 /generate-invoice router hit");


  const iccPath = process.env.ICC_PROFILE_PATH || path.resolve(__dirname, "../app/sRGB_IEC61966-2-1_no_black_scaling.icc");
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





  let browser;
  const tmpDir = "/tmp/pdfify-batch-" + Date.now();
  fs.mkdirSync(tmpDir);

  try {
    let requests = req.body.requests;
    
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
    

    const user = await User.findById(req.user.userId);
    if (!user) {
      console.error("❌ User not found:", req.user.userId);
      return res.status(404).json({ error: "User not found" });
    }
    

  
    const now = new Date();
    if (!user.previewLastReset || now.getMonth() !== user.previewLastReset.getMonth() || now.getFullYear() !== user.previewLastReset.getFullYear()) {
      user.previewCount = 0;
      user.previewLastReset = now;
    }
    if (!user.usageLastReset || now.getMonth() !== user.usageLastReset.getMonth() || now.getFullYear() !== user.usageLastReset.getFullYear()) {
      user.usageCount = 0;
      user.usageLastReset = now;
    }

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

     
      const countryRaw = invoiceData.country || "slovenia";
      const country = countryRaw.toLowerCase();
      invoiceData.country = country;

      
      function parseSafeNumber(value) {
        if (typeof value === "string") {
          return parseFloat(value.replace(/[^\d.]/g, "")) || 0;
        }
        return parseFloat(value) || 0;
      }

      if (country === "germany" && Array.isArray(invoiceData.items)) {
        invoiceData.items = invoiceData.items.map((item, i) => {
          const totalNum = parseSafeNumber(item.total);
          const taxRate = 0.19;
          const net = totalNum / (1 + taxRate);
          const taxAmount = totalNum - net;
          return {
            ...item,
            tax: taxAmount.toFixed(2),
            net: net.toFixed(2),
          };
        });
      }


      function formatTaxRate(rate) {
        if (typeof rate === 'string') {
          return rate.includes('%') ? rate : `${rate}%`;
        }
        if (typeof rate === 'number') {
          return `${(rate * 100).toFixed(0)}%`;
        }
        return '21%';
      }
      invoiceData.taxRate = formatTaxRate(invoiceData.taxRate || '21%');

      
      const supportedLocales = {
        slovenia: "sl",
        germany: "de",
        
      };
      const langCode = supportedLocales[country] || "en";
      const locale = locales[langCode] || locales["en"];
      invoiceData.locale = locale;

     
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

      const safeOrderId = invoiceData.orderId || `invoice-${Date.now()}-${index}`;
      invoiceData.isBasicUser = !user.isPremium;
      if (!user.isPremium) {
        invoiceData.customLogoUrl = null;
        invoiceData.showChart = false;
      }

      const html = generateEnglishInvoice({ ...invoiceData, isPreview });
      if (!html || typeof html !== "string") {
        results.push({ error: "Failed to generate HTML" });
        continue;
      }

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });

      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "20mm", bottom: "20mm", left: "10mm", right: "10mm" },
      });
      await page.close();

      let finalPdfBytes = pdfBuffer;

   
const pdfDoc = await PDFDocument.load(pdfBuffer);




const pageCount = pdfDoc.getPageCount();



const usageAllowed = await incrementUsage(user, pageCount, isPreview,  FORCE_PLAN);
if (!usageAllowed) {
  return res.status(403).json({ error: 'Monthly usage limit reached. Upgrade to premium for more pages.' });
}





      if (user.plan === "pro") {
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
await embedXmp(pdfDoc, xmpPath);


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
      }

      const tempInput = path.join(tmpDir, `input-${index}.pdf`);
      const tempOutput = path.join(tmpDir, `output-${index}.pdf`);
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
  "-dFlattenTransparency=true",       
  "-sOutputICCProfile=/app/sRGB_IEC61966-2-1_no_black_scaling.icc",
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

      

    await user.save();
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