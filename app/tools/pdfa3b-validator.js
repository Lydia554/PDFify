#!/usr/bin/env node
/**
 * Strict PDF/A-3b Validator (Windows-ready, closer to VeraPDF)
 *
 * Usage:
 *   node pdfa3b-validator.js <file.pdf>
 *
 * Output: JSON report with errors/warnings.
 */

const fs = require('fs');
const { PDFDocument, PDFName, PDFRef, PDFDict, PDFArray, PDFStream } = require('pdf-lib');

/* ------------------ Public API ------------------ */
async function validatePDFA3bStrict(pdfBuffer) {
  const errors = [];
  const warnings = [];
  const info = {};

  const u8 = toUint8Array(pdfBuffer);

  // Header version check
  const headerVersion = sniffHeaderVersion(u8);
  info.headerVersion = headerVersion || null;
  if (!headerVersion) errors.push('Could not read PDF header version.');
  else if (parseFloat(headerVersion) < 1.4) errors.push(`PDF header version ${headerVersion} too old for PDF/A-3b.`);

  // Load PDF
  let pdf;
  try {
    pdf = await PDFDocument.load(u8, { ignoreEncryption: false, updateMetadata: false });
  } catch (e) {
    return { ok: false, errors: ['Failed to parse PDF (encrypted or corrupted).'], warnings: [], report: {} };
  }

  const ctx = pdf.context;
  const catalogDict = pdf.catalog && pdf.catalog.dict;
  info.hasCatalog = !!catalogDict;

  // OutputIntents
  const oiResult = checkOutputIntents(pdf);
  if (oiResult.errors.length) errors.push(...oiResult.errors);
  if (oiResult.warnings.length) warnings.push(...oiResult.warnings);
  info.outputIntents = oiResult.report;

  // XMP metadata
  const xmpResult = await checkXMP(pdf);
  if (xmpResult.errors.length) errors.push(...xmpResult.errors);
  if (xmpResult.warnings.length) warnings.push(...xmpResult.warnings);
  info.xmp = xmpResult.report;

  // Fonts
  const fontResult = checkFonts(pdf);
  if (fontResult.errors.length) errors.push(...fontResult.errors);
  if (fontResult.warnings.length) warnings.push(...fontResult.warnings);
  info.fonts = fontResult.report;

  // Embedded files
  const embResult = checkEmbeddedFiles(pdf);
  if (embResult.errors.length) errors.push(...embResult.errors);
  if (embResult.warnings.length) warnings.push(...embResult.warnings);
  info.embeddedFiles = embResult.report;

  // Forbidden features
  const bannedResult = checkForbiddenFeatures(pdf);
  if (bannedResult.errors.length) errors.push(...bannedResult.errors);
  if (bannedResult.warnings.length) warnings.push(...bannedResult.warnings);
  info.forbidden = bannedResult.report;

  // Color spaces
  const colorResult = checkColorSpaces(pdf);
  if (colorResult.warnings.length) warnings.push(...colorResult.warnings);
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
  if (!catalog) {
    errors.push('Catalog missing.');
    return { errors, warnings, report };
  }

  const oiObj = catalog.get(PDFName.of('OutputIntents'));
  if (!oiObj) {
    errors.push('Catalog missing /OutputIntents array.');
    return { errors, warnings, report };
  }

  const oiArr = deref(oiObj, ctx);

  // Changed: check for PDFArray capabilities instead of instanceof
  if (!oiArr || typeof oiArr.size !== 'function' || typeof oiArr.get !== 'function') {
    errors.push('/OutputIntents is not a valid array.');
    return { errors, warnings, report };
  }

  report.found = oiArr.size() > 0;

  let hasValidICC = false;
  for (let i = 0; i < oiArr.size(); i++) {
    const oi = deref(oiArr.get(i), ctx);
    if (!oi || typeof oi.get !== 'function') continue; // treat as PDFDict if it has get()

    const S = resolveName(oi.get(PDFName.of('S')), ctx);
    const oci = resolveObjectToString(oi.get(PDFName.of('OutputConditionIdentifier')), ctx);
    const dest = oi.get(PDFName.of('DestOutputProfile'));
    const destStream = deref(dest, ctx);

    report.intents.push({ S, OutputConditionIdentifier: oci, hasDestOutputProfile: !!destStream });

    if (!destStream || typeof destStream.getContents !== 'function') {
      errors.push(`OutputIntent #${i} missing DestOutputProfile.`);
      continue;
    }

    const bytes = destStream.getContents();
    if (!bytes || bytes.length < 36) errors.push(`OutputIntent #${i} ICC profile too small.`);
    else if (Buffer.from(bytes.slice(36, 40)).toString('ascii') !== 'acsp')
      errors.push(`OutputIntent #${i} ICC profile missing 'acsp' signature.`);
    else hasValidICC = true;

    if (!S) warnings.push('OutputIntent /S missing.');
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
  if (!catalog) {
    errors.push('Catalog missing.');
    return { errors, warnings, report };
  }

  const md = catalog.get(PDFName.of('Metadata'));
  if (!md) {
    errors.push('Catalog missing /Metadata (XMP).');
    return { errors, warnings, report };
  }

  const mdStream = deref(md, ctx);

  // Changed: check for PDFStream capabilities instead of instanceof
  if (!mdStream || typeof mdStream.getContents !== 'function') {
    errors.push('/Metadata is not a valid stream.');
    return { errors, warnings, report };
  }

  const bytes = mdStream.getContents();
  report.hasMetadata = true;
  report.bytes = bytes ? bytes.length : 0;

  let xml;
  try {
    xml = Buffer.from(bytes).toString('utf8');
  } catch {
    errors.push('Could not decode XMP as UTF-8.');
    return { errors, warnings, report };
  }

  if (/rdf:RDF/i.test(xml)) report.rdfPresent = true;
  if (/^\s*<\?xpacket/i.test(xml)) report.xpacket = true;

  const partMatch = xml.match(/<[^:>]+:part>\s*([0-9]+)\s*<\/[^:>]+:part>/i);
  const confMatch = xml.match(/<[^:>]+:conformance>\s*([A-Za-z0-9]+)\s*<\/[^:>]+:conformance>/i);

  if (partMatch) report.part = Number(partMatch[1]);
  else errors.push('XMP missing pdfaid:part=3.');
  if (confMatch) report.conformance = confMatch[1];
  else errors.push('XMP missing pdfaid:conformance=B.');

  if (!report.xpacket) errors.push('XMP missing xpacket wrapper.');

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
      if (!dict || !(dict instanceof PDFDict)) continue;
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

    // Handle dictionary
    if (colorSpaces instanceof PDFDict) {
      for (const key of colorSpaces.keys()) {
        const val = deref(colorSpaces.get(key), ctx);
        const csName = val instanceof PDFName ? val.value() : null;
        if (csName === 'DeviceRGB' || csName === 'DeviceCMYK' || csName === 'DeviceGray') {
          warnings.push(`Page uses device color space: ${csName}`);
          report.deviceColorSpaces.push(csName);
        }
      }
    }
    // Handle single name
    else if (colorSpaces instanceof PDFName) {
      const csName = colorSpaces.value();
      if (csName === 'DeviceRGB' || csName === 'DeviceCMYK' || csName === 'DeviceGray') {
        warnings.push(`Page uses device color space: ${csName}`);
        report.deviceColorSpaces.push(csName);
      }
    }
    // Handle array (rare)
    else if (colorSpaces instanceof PDFArray) {
      for (let i = 0; i < colorSpaces.size(); i++) {
        const val = deref(colorSpaces.get(i), ctx);
        const csName = val instanceof PDFName ? val.value() : null;
        if (csName === 'DeviceRGB' || csName === 'DeviceCMYK' || csName === 'DeviceGray') {
          warnings.push(`Page uses device color space: ${csName}`);
          report.deviceColorSpaces.push(csName);
        }
      }
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
  try { return obj && obj.lookup ? obj.lookup(ctx) : obj; } catch { return null; }
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
  // only run CLI code if file is executed directly
  (async () => {
    const args = process.argv.slice(2);
    if (args.length < 1) {
      console.error('Usage: node pdfa3b-validator.js <file.pdf>');
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
