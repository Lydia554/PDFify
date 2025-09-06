#!/usr/bin/env node
/**
 * Enhanced PDF/A-3b Validator (VeraPDF-like)
 *
 * Usage:
 *   node pdfa3b-validator-strict.js <file.pdf>
 *
 * Output: JSON report with errors/warnings.
 */

const fs = require('fs');
const { PDFDocument, PDFName, PDFDict, PDFArray, PDFStream, PDFRef } = require('pdf-lib');
const { XMLParser } = require('fast-xml-parser');

/* ------------------ Public API ------------------ */
async function validatePDFA3bStrict(pdfBuffer) {
  const errors = [];
  const warnings = [];
  const info = {};

  const u8 = toUint8Array(pdfBuffer);

  // Header version
  const headerVersion = sniffHeaderVersion(u8);
  info.headerVersion = headerVersion || null;
  if (!headerVersion) errors.push('Could not read PDF header version.');
  else if (parseFloat(headerVersion) < 1.4)
    errors.push(`PDF header version ${headerVersion} too old for PDF/A-3b.`);

  // Load PDF
  let pdf;
  try {
    pdf = await PDFDocument.load(u8, { ignoreEncryption: false, updateMetadata: false });
  } catch (e) {
    return { ok: false, errors: ['Failed to parse PDF (encrypted or corrupted).'], warnings: [], report: {} };
  }

  info.hasCatalog = !!(pdf.catalog && pdf.catalog.dict);

  // OutputIntents
  const oiResult = checkOutputIntents(pdf);
  errors.push(...oiResult.errors);
  warnings.push(...oiResult.warnings);
  info.outputIntents = oiResult.report;

  // XMP metadata
  const xmpResult = await checkXMP(pdf);
  errors.push(...xmpResult.errors);
  warnings.push(...xmpResult.warnings);
  info.xmp = xmpResult.report;

  // Fonts
  const fontResult = checkFonts(pdf);
  errors.push(...fontResult.errors);
  warnings.push(...fontResult.warnings);
  info.fonts = fontResult.report;

  // Embedded files
  const embResult = checkEmbeddedFiles(pdf);
  errors.push(...embResult.errors);
  warnings.push(...embResult.warnings);
  info.embeddedFiles = embResult.report;

  // Forbidden features
  const bannedResult = checkForbiddenFeatures(pdf);
  errors.push(...bannedResult.errors);
  warnings.push(...bannedResult.warnings);
  info.forbidden = bannedResult.report;

  // Color spaces
  const colorResult = checkColorSpaces(pdf);
  warnings.push(...colorResult.warnings);
  info.color = colorResult.report;

  const ok = errors.length === 0;
  return { ok, errors, warnings, report: info };
}

/* ------------------ Validators ------------------ */
function checkOutputIntents(pdf) {
  const errors = [];
  const warnings = [];
  const report = { found: false, intents: [] };

  const ctx = pdf.context;
  const catalog = pdf.catalog && pdf.catalog.dict;
  if (!catalog) { errors.push('Catalog missing.'); return { errors, warnings, report }; }

  const oiObj = catalog.get(PDFName.of('OutputIntents'));
  console.log("DEBUG: Raw /OutputIntents =", oiObj ? oiObj.constructor.name : "null");

  if (!oiObj) { errors.push('Catalog missing /OutputIntents array.'); return { errors, warnings, report }; }

  const oiArr = deref(oiObj, ctx);
  console.log("DEBUG: After deref /OutputIntents =", oiArr ? oiArr.constructor.name : "null");

  if (!(oiArr instanceof PDFArray)) {
    console.log("DEBUG: /OutputIntents not PDFArray:", oiArr);
    errors.push('/OutputIntents is not a valid array.');
    return { errors, warnings, report };
  }

  report.found = oiArr.size() > 0;
  let hasValidICC = false;

  for (let i = 0; i < oiArr.size(); i++) {
    const oi = deref(oiArr.get(i), ctx);
    console.log(`DEBUG: OutputIntent[${i}] =`, oi ? oi.constructor.name : "null");
    if (!oi || typeof oi.get !== 'function') continue;

    const S = resolveName(oi.get(PDFName.of('S')), ctx);
    const oci = resolveObjectToString(oi.get(PDFName.of('OutputConditionIdentifier')), ctx);
    const dest = oi.get(PDFName.of('DestOutputProfile'));
    const destStream = deref(dest, ctx);

    console.log(`DEBUG: OutputIntent[${i}] S=${S}, OCI=${oci}, DestStream=${destStream ? destStream.constructor.name : "null"}`);

    report.intents.push({ S, OutputConditionIdentifier: oci, hasDestOutputProfile: !!destStream });

    if (!(destStream instanceof PDFStream)) {
      errors.push(`OutputIntent #${i} missing DestOutputProfile.`);
      continue;
    }

    const bytes = destStream.getContents();
    errors.push(...validateICCProfile(bytes));
    if (bytes && Buffer.from(bytes.slice(36, 40)).toString('ascii') === 'acsp') hasValidICC = true;

    if (!S) warnings.push('OutputIntent /S missing.');
    else if (S !== 'GTS_PDFA1') errors.push(`OutputIntent /S must be GTS_PDFA1 for PDF/A-3b.`);
    if (!oci) warnings.push('OutputIntent /OutputConditionIdentifier missing.');
  }

  if (!hasValidICC) errors.push('No valid ICC profile found in OutputIntents.');
  return { errors, warnings, report };
}

async function checkXMP(pdf) {
  const errors = [];
  const warnings = [];
  const report = { hasMetadata: false, bytes: 0, part: null, conformance: null, rdfPresent: false, xpacket: false };

  const ctx = pdf.context;
  const catalog = pdf.catalog && pdf.catalog.dict;
  if (!catalog) { errors.push('Catalog missing.'); return { errors, warnings, report }; }

  const md = catalog.get(PDFName.of('Metadata'));
  console.log("DEBUG: Raw /Metadata =", md ? md.constructor.name : "null");

  if (!md) { errors.push('Catalog missing /Metadata (XMP).'); return { errors, warnings, report }; }

  const mdStream = deref(md, ctx);
  console.log("DEBUG: After deref /Metadata =", mdStream ? mdStream.constructor.name : "null");

  if (!(mdStream instanceof PDFStream)) {
    errors.push('/Metadata is not a valid stream.');
    return { errors, warnings, report };
  }

  const bytes = mdStream.getContents();
  console.log("DEBUG: Metadata length =", bytes ? bytes.length : 0);

  report.hasMetadata = true;
  report.bytes = bytes ? bytes.length : 0;

  let xml;
  try { xml = Buffer.from(bytes).toString('utf8'); } 
  catch { errors.push('Could not decode XMP as UTF-8.'); return { errors, warnings, report }; }

  if (/rdf:RDF/i.test(xml)) report.rdfPresent = true;
  if (/^\s*<\?xpacket/i.test(xml)) report.xpacket = true;

  try {
    const parser = new XMLParser({ ignoreAttributes: false });
    parser.parse(xml);
    if (!/pdfaid:part=3/i.test(xml)) errors.push('XMP missing pdfaid:part=3.');
    if (!/pdfaid:conformance=B/i.test(xml)) errors.push('XMP missing pdfaid:conformance=B.');
  } catch { errors.push('XMP XML parsing error.'); }

  return { errors, warnings, report };
}

function validateICCProfile(bytes) {
  const errors = [];
  if (!bytes || bytes.length < 36) { errors.push('ICC profile too small.'); return errors; }
  if (Buffer.from(bytes.slice(36, 40)).toString('ascii') !== 'acsp')
    errors.push('ICC profile missing "acsp" signature.');
  const colorSpace = Buffer.from(bytes.slice(16, 20)).toString('ascii');
  if (!['RGB ', 'CMYK', 'GRAY'].includes(colorSpace))
    errors.push(`ICC profile color space is ${colorSpace}, expected RGB/CMYK/GRAY.`);
  return errors;
}

function checkFonts(pdf) {
  const errors = [];
  const warnings = [];
  const report = { totalFonts: 0, notEmbedded: [], subsetFonts: [] };
  const ctx = pdf.context;

  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue;
    const type = obj.get(PDFName.of('Type'));
    if (!type || resolveName(type, ctx) !== 'Font') continue;

    report.totalFonts++;
    const fd = deref(obj.get(PDFName.of('FontDescriptor')), ctx);
    const fontName = resolveObjectToString(obj.get(PDFName.of('BaseFont')), ctx) || '(unnamed)';
    const hasFF = fd && (fd.get(PDFName.of('FontFile')) || fd.get(PDFName.of('FontFile2')) || fd.get(PDFName.of('FontFile3')));
    if (!hasFF) { errors.push(`Font "${fontName}" is not embedded.`); report.notEmbedded.push(fontName); }
    else if (/^[A-Z]{6}\+/.test(fontName)) report.subsetFonts.push(fontName);
  }

  return { errors, warnings, report };
}

function checkEmbeddedFiles(pdf) {
  const errors = [];
  const warnings = [];
  const report = { hasAF: false, embeddedFiles: [] };
  const ctx = pdf.context;
  const catalog = pdf.catalog && pdf.catalog.dict;
  if (!catalog) return { errors: ['Catalog missing.'], warnings, report };

  const af = catalog.get(PDFName.of('AF'));
  if (af) {
    report.hasAF = true;
    const afArr = deref(af, ctx);
    if (afArr instanceof PDFArray) {
      for (let i = 0; i < afArr.size(); i++) {
        const fspec = deref(afArr.get(i), ctx);
        const AFRelationship = resolveName(fspec?.get(PDFName.of('AFRelationship')), ctx) || null;
        if (!AFRelationship) warnings.push('AF file spec missing /AFRelationship.');
        report.embeddedFiles.push({ fileSpec: fspec ? fspec.toString() : null, AFRelationship });
      }
    } else warnings.push('AF array not valid.');
  }

  return { errors, warnings, report };
}

function checkForbiddenFeatures(pdf) {
  const errors = [];
  const warnings = [];
  const report = { jsActions: [], launchActions: [], richMedia: [], openActions: [] };
  const ctx = pdf.context;

  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue;
    const candidates = [];
    if (obj.get(PDFName.of('AA'))) candidates.push(obj.get(PDFName.of('AA')));
    if (obj.get(PDFName.of('A'))) candidates.push(obj.get(PDFName.of('A')));
    if (obj.get(PDFName.of('OpenAction'))) candidates.push(obj.get(PDFName.of('OpenAction')));

    for (const cand of candidates) {
      const dict = deref(cand, ctx);
      if (!dict || typeof dict.get !== 'function') continue;
      const S = resolveName(dict.get(PDFName.of('S')), ctx);
      if (!S) continue;

      if (/JavaScript/i.test(S)) { errors.push('JavaScript action found.'); report.jsActions.push(S); }
      if (/Launch/i.test(S)) { errors.push('Launch action found.'); report.launchActions.push(S); }
      if (/RichMedia|Movie|Sound/i.test(S)) { errors.push(`${S} action found.`); report.richMedia.push(S); }
    }
  }

  return { errors, warnings, report };
}

function checkColorSpaces(pdf) {
  const warnings = [];
  const report = { pages: 0, deviceColorSpaces: [] };
  const ctx = pdf.context;
  const pages = pdf.getPages();
  report.pages = pages.length;

  for (const page of pages) {
    const resources = page.node.Resources();
    if (!resources) continue;
    const colorSpaces = deref(resources.get(PDFName.of('ColorSpace')), ctx);
    if (!colorSpaces) continue;

    const handleCS = (val) => {
      const csName = val && val.value ? val.value : null;
      if (csName && ['DeviceRGB', 'DeviceCMYK', 'DeviceGray'].includes(csName)) {
        warnings.push(`Page uses device color space: ${csName}`);
        report.deviceColorSpaces.push(csName);
      }
    };

    if (colorSpaces instanceof PDFDict) { // dictionary
      for (const key of colorSpaces.keys()) handleCS(deref(colorSpaces.get(key), ctx));
    } else if (colorSpaces.value) handleCS(colorSpaces); // single name
    else if (colorSpaces instanceof PDFArray) { // array
      for (let i = 0; i < colorSpaces.size(); i++) handleCS(deref(colorSpaces.get(i), ctx));
    }
  }

  return { warnings, report };
}

/* ------------------ Helpers ------------------ */
function toUint8Array(buffer) {
  if (buffer instanceof Uint8Array) return buffer;
  if (Buffer.isBuffer(buffer)) return new Uint8Array(buffer);
  throw new Error('Unsupported buffer type');
}

function deref(obj, ctx) {
  if (!obj) return null;
  try {
    if (obj instanceof PDFRef) return ctx.lookup(obj);
    return obj;
  } catch { return obj; }
}

function resolveName(obj, ctx) { try { return obj && obj.value ? obj.value : null; } catch { return null; } }
function resolveObjectToString(obj, ctx) { try { return obj && obj.value ? obj.value.toString() : null; } catch { return null; } }
function sniffHeaderVersion(bytes) {
  if (!bytes || bytes.length < 8) return null;
  const str = Buffer.from(bytes.slice(0, 8)).toString('ascii');
  const m = str.match(/%PDF-([0-9.]+)/);
  return m ? m[1] : null;
}

/* ------------------ CLI ------------------ */
if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    if (args.length < 1) {
      console.error('Usage: node pdfa3b-validator-strict.js <file.pdf>');
      process.exit(1);
    }

    const filePath = args[0];
    if (!fs.existsSync(filePath)) {
      console.error('File not found:', filePath);
      process.exit(1);
    }

    const buffer = fs.readFileSync(filePath);
    const result = await validatePDFA3bStrict(buffer);
    console.log(JSON.stringify(result, null, 2));
  })();
}

module.exports = { validatePDFA3bStrict };
