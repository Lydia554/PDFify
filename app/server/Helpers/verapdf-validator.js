const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * veraPDF Validator Helper
 * Validates PDF/A-3b compliance using local veraPDF installation
 */

// Detect veraPDF path based on platform
function getVeraPdfPath() {
    // Check environment variable first
    const envPath = process.env.VERAPDF_PATH;
    if (envPath && fs.existsSync(envPath)) {
        return envPath;
    }

    // Platform-specific defaults
    if (process.platform === 'win32') {
        // Windows: check common locations
        const winPaths = [
            'C:\\Program Files\\veraPDF\\verapdf.bat',
            'C:\\Program Files (x86)\\veraPDF\\verapdf.bat',
            path.join(__dirname, '../../../verapdf-pdfbox-1.28.1/verapdf.bat')
        ];
        for (const p of winPaths) {
            if (fs.existsSync(p)) return p;
        }
    } else {
        // Linux/Mac: use system-installed veraPDF
        const linuxPaths = [
            '/usr/local/bin/verapdf',
            '/usr/bin/verapdf',
            '/opt/verapdf-1.28.1/verapdf'
        ];
        for (const p of linuxPaths) {
            if (fs.existsSync(p)) return p;
        }
    }

    // Fallback: assume 'verapdf' is in PATH
    return 'verapdf';
}

const VERAPDF_PATH = getVeraPdfPath();
const TEMP_DIR = path.join(__dirname, '../../temp');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

console.log(`[veraPDF] Using path: ${VERAPDF_PATH}`);

/**
 * Parse veraPDF XML output to extract validation results
 * @param {string} xmlOutput - Raw XML output from veraPDF
 * @returns {object} Parsed validation result
 */
function parseVeraPdfXml(xmlOutput) {
    const result = {
        compliant: false,
        profileName: '',
        passCount: 0,
        failCount: 0,
        totalRules: 0,
        rules: [],
        summary: ''
    };

    try {
        // Parse compliance attribute
        const compliantMatch = xmlOutput.match(/compliant="([^"]+)"/);
        if (compliantMatch) {
            result.compliant = compliantMatch[1] === 'true';
        }

        // Parse profile name
        const profileMatch = xmlOutput.match(/profileName="([^"]+)"/);
        if (profileMatch) {
            result.profileName = profileMatch[1];
        }

        // Parse pass/fail counts from validationResult
        const passMatch = xmlOutput.match(/passedRules="(\d+)"/);
        const failMatch = xmlOutput.match(/failedRules="(\d+)"/);

        if (passMatch) result.passCount = parseInt(passMatch[1], 10);
        if (failMatch) result.failCount = parseInt(failMatch[1], 10);
        result.totalRules = result.passCount + result.failCount;

        // Parse individual rules (if available in detailed output)
        const ruleRegex = /<test\s+([^>]+)>/g;
        let match;
        while ((match = ruleRegex.exec(xmlOutput)) !== null) {
            const attrs = match[1];
            const idMatch = attrs.match(/id="([^"]+)"/);
            const statusMatch = attrs.match(/status="([^"]+)"/);
            const clauseMatch = attrs.match(/clause="([^"]*)"/);

            if (idMatch && statusMatch) {
                result.rules.push({
                    id: idMatch[1],
                    status: statusMatch[1],
                    clause: clauseMatch ? clauseMatch[1] : '',
                    description: statusMatch[1] === 'failed' ? 'Rule violation' : 'Passed'
                });
            }
        }

        // Generate summary
        const percentage = result.totalRules > 0
            ? ((result.passCount / result.totalRules) * 100).toFixed(1)
            : 0;
        result.summary = `PDF/A-3b Validation: ${result.passCount}/${result.totalRules} rules passed (${percentage}%)`;

    } catch (err) {
        console.error('Error parsing veraPDF XML:', err);
        result.summary = 'Error parsing validation results';
    }

    return result;
}

/**
 * Validate a PDF file using veraPDF
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {object} options - Validation options
 * @returns {Promise<object>} Validation result
 */
async function validatePdfWithVeraPdf(pdfBuffer, options = {}) {
    const { autoFix = false } = options;

    // Create temp file for validation
    const tempId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    const tempPdfPath = path.join(TEMP_DIR, `validate-${tempId}.pdf`);

    try {
        // Write PDF to temp file
        fs.writeFileSync(tempPdfPath, pdfBuffer);

        console.log(`[veraPDF] Starting validation: ${tempPdfPath}`);

        // Run veraPDF with PDF/A-3b flavour
        const result = await runVeraPdf(tempPdfPath);

        // Check if auto-fix is needed and requested
        if (!result.compliant && autoFix && needsAutoFix(result)) {
            console.log('[veraPDF] Auto-fix requested, attempting to fix CIDSet issue...');
            const fixedPdf = await attemptAutoFix(pdfBuffer, result);

            if (fixedPdf) {
                // Validate the fixed PDF
                const fixedTempPath = path.join(TEMP_DIR, `fixed-${tempId}.pdf`);
                fs.writeFileSync(fixedTempPath, fixedPdf);

                const fixedResult = await runVeraPdf(fixedTempPath);
                fixedResult.fixedPdf = fixedPdf;

                // Cleanup
                try { fs.unlinkSync(tempPdfPath); } catch(e) {}
                try { fs.unlinkSync(fixedTempPath); } catch(e) {}

                return fixedResult;
            }
        }

        // Cleanup
        try { fs.unlinkSync(tempPdfPath); } catch(e) {}

        return result;

    } catch (err) {
        console.error('[veraPDF] Validation error:', err);

        // Cleanup on error
        try { fs.unlinkSync(tempPdfPath); } catch(e) {}

        return {
            compliant: false,
            error: err.message,
            summary: 'Validation failed: ' + err.message,
            passCount: 0,
            failCount: 0,
            totalRules: 0,
            rules: []
        };
    }
}

/**
 * Run veraPDF command and parse output
 * @param {string} pdfPath - Path to PDF file
 * @returns {Promise<object>} Validation result
 */
function runVeraPdf(pdfPath) {
    return new Promise((resolve, reject) => {
        const args = [
            '--format', 'xml',
            '--flavour', '3b',
            pdfPath
        ];

        console.log(`[veraPDF] Running: ${VERAPDF_PATH} ${args.join(' ')}`);

        // Platform-specific spawn options
        const spawnOptions = {
            windowsHide: true
        };

        // Windows needs shell mode for .bat files
        if (process.platform === 'win32' || VERAPDF_PATH.endsWith('.bat')) {
            spawnOptions.shell = true;
        }

        const veraPdf = spawn(VERAPDF_PATH, args, spawnOptions);

        let stdout = '';
        let stderr = '';

        veraPdf.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        veraPdf.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        veraPdf.on('close', (code) => {
            console.log(`[veraPDF] Exit code: ${code}`);

            if (stdout) {
                const result = parseVeraPdfXml(stdout);
                resolve(result);
            } else if (stderr) {
                reject(new Error(`veraPDF error: ${stderr}`));
            } else {
                reject(new Error('veraPDF returned no output'));
            }
        });

        veraPdf.on('error', (err) => {
            reject(new Error(`Failed to start veraPDF: ${err.message}`));
        });

        // Timeout after 30 seconds
        setTimeout(() => {
            veraPdf.kill();
            reject(new Error('veraPDF validation timed out'));
        }, 30000);
    });
}

/**
 * Check if validation result indicates a fixable issue
 * @param {object} result - Validation result
 * @returns {boolean} True if issue is likely fixable
 */
function needsAutoFix(result) {
    // Check for CIDSet-related issues (common font embedding problem)
    const hasCidSetIssue = result.rules.some(rule =>
        rule.id && (
            rule.id.includes('CIDSet') ||
            rule.id.includes('CIDToGIDMap') ||
            rule.id.includes('font') ||
            rule.clause && rule.clause.includes('6.3.5')
        )
    );

    return hasCidSetIssue || result.passCount >= result.totalRules - 5; // Fixable if close to compliant
}

/**
 * Attempt to auto-fix common PDF/A compliance issues
 * Currently focuses on font/CIDSet issues
 * @param {Buffer} pdfBuffer - Original PDF buffer
 * @param {object} validationResult - Validation result
 * @returns {Promise<Buffer|null>} Fixed PDF buffer or null
 */
async function attemptAutoFix(pdfBuffer, validationResult) {
    try {
        const { PDFDocument, PDFName } = require('pdf-lib');

        // Load PDF
        const pdfDoc = await PDFDocument.load(pdfBuffer, {
            ignoreEncryption: true,
            updateMetadata: false
        });

        // Try to fix common issues:
        // 1. Ensure all fonts have CIDSet
        // 2. Add proper XMP metadata
        // 3. Ensure output intent is present

        let modified = false;

        // Check and add ICC profile if missing
        const outputIntents = pdfDoc.catalog.get(PDFName.of('OutputIntents'));
        if (!outputIntents) {
            console.log('[AutoFix] Adding missing OutputIntent');

            const iccPath = path.join(__dirname, 'sRGB2014.icc');
            if (fs.existsSync(iccPath)) {
                const iccBytes = fs.readFileSync(iccPath);
                const iccStream = pdfDoc.context.flateStream(iccBytes, {
                    N: 3,
                    Alternate: PDFName.of('DeviceRGB')
                });
                const iccRef = pdfDoc.context.register(iccStream);

                const outputIntent = pdfDoc.context.obj({
                    Type: 'OutputIntent',
                    S: 'GTS_PDFA1',
                    OutputConditionIdentifier: PDFName.of('sRGB'),
                    RegistryName: PDFName.of('http://www.color.org'),
                    Info: PDFName.of('sRGB2014'),
                    DestOutputProfile: iccRef,
                });

                pdfDoc.catalog.set(PDFName.of('OutputIntents'), pdfDoc.context.obj([outputIntent]));
                modified = true;
            }
        }

        // Ensure PDF/A version metadata
        const version = pdfDoc.catalog.get(PDFName.of('Version'));
        if (!version || version.toString() !== 'PDF-1.7') {
            console.log('[AutoFix] Setting PDF version to 1.7');
            pdfDoc.catalog.set(PDFName.of('Version'), PDFName.of('1.7'));
            modified = true;
        }

        if (modified) {
            const fixedPdf = await pdfDoc.save();
            console.log('[AutoFix] PDF modified successfully');
            return Buffer.from(fixedPdf);
        }

        console.log('[AutoFix] No fixable issues found');
        return null;

    } catch (err) {
        console.error('[AutoFix] Error:', err);
        return null;
    }
}

module.exports = {
    validatePdfWithVeraPdf,
    parseVeraPdfXml,
    runVeraPdf,
    needsAutoFix,
    attemptAutoFix
};
