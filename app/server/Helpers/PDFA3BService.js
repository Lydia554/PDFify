const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const generateZugferdXml = require('../../xml/generateZugferdXml');

/**
 * Node.js wrapper for Apache PDFBox Java PDF/A-3b service
 * Uses Apache PDFBox 3.0.3 with ZUGFeRD 2.4 XML embedding
 */
class PDFA3BService {

    constructor() {
        // Paths
        this.javaHome = 'C:\\Users\\goldb\\Downloads\\jdk-21';
        this.javaBin = path.join(this.javaHome, 'bin', 'java.exe');
        this.serviceDir = path.join(__dirname, '..', '..', '..', 'java-pdfa-service');
        this.targetDir = path.join(this.serviceDir, 'target');
        this.libDir = path.join(this.serviceDir, 'lib');
    }

    /**
     * Generate a PDF/A-3b compliant invoice with ZUGFeRD XML
     * @param {Object} invoiceData - Invoice information
     * @returns {Promise<Buffer>} PDF/A-3b compliant document buffer
     */
    async generateInvoice(invoiceData) {
        return new Promise((resolve, reject) => {
            const { orderId } = invoiceData;

            console.log('[PDFA3B] Generating PDF/A-3b invoice:', orderId);

            // Generate ZUGFeRD XML using JavaScript function
            let zugferdXml;
            try {
                zugferdXml = generateZugferdXml(invoiceData);
                console.log('[PDFA3B] ZUGFeRD XML generated:', zugferdXml.length, 'bytes');
            } catch (err) {
                console.error('[PDFA3B] Failed to generate ZUGFeRD XML:', err.message);
                reject(new Error('XML generation failed: ' + err.message));
                return;
            }

            // Prepare classpath
            const classpath = [
                this.targetDir,
                path.join(this.libDir, 'pdfbox-app-3.0.3.jar')
            ].join(';');

            // Prepare Java command
            const javaArgs = [
                '-cp', classpath,
                'com.pdfa.PDFA3BService'
            ];

            console.log('[PDFA3B] Java command:', this.javaBin);
            console.log('[PDFA3B] Classpath:', classpath);

            // Spawn Java process
            const java = spawn(this.javaBin, javaArgs, {
                cwd: this.serviceDir,
                stdio: 'pipe',
                timeout: 60000,
                env: {
                    JAVA_HOME: this.javaHome
                }
            });

            let stdout = '';
            let stderr = '';

            java.stdout.on('data', function(data) {
                const text = data.toString();
                stdout += text;
                console.log('[PDFA3B Java]', text.trim());
            });

            java.stderr.on('data', function(data) {
                const text = data.toString();
                stderr += text;
                console.error('[PDFA3B Java Error]', text.trim());
            });

            java.on('close', (code) => {
                if (code === 0) {
                    console.log('[PDFA3B] Java service completed successfully');

                    // Parse output to find PDF path
                    const match = stdout.match(/PDF created: (.+)/);
                    if (match && match[1]) {
                        const pdfPath = match[1].trim();

                        console.log('[PDFA3B] PDF generated at:', pdfPath);

                        // Read and return PDF buffer
                        try {
                            const pdfBuffer = fs.readFileSync(pdfPath);
                            console.log('[PDFA3B] PDF size:', pdfBuffer.length, 'bytes');
                            resolve(pdfBuffer);
                        } catch(err) {
                            reject(new Error('Failed to read PDF: ' + err.message));
                        }
                    } else {
                        reject(new Error('Could not find PDF path in Java output'));
                    }
                } else {
                    reject(new Error('Java service failed with code ' + code + ': ' + stderr));
                }
            });

            java.on('error', function(err) {
                console.error('[PDFA3B] Java process error:', err);
                reject(new Error('Java process error: ' + err.message));
            });
        });
    }

    /**
     * Check if Java service is ready
     */
    isReady() {
        // Check if compiled classes exist
        const classFile = path.join(this.targetDir, 'com', 'pdfa', 'PDFA3BService.class');
        const jarFile = path.join(this.libDir, 'pdfbox-app-3.0.3.jar');

        const classExists = fs.existsSync(classFile);
        const jarExists = fs.existsSync(jarFile);
        const javaExists = fs.existsSync(this.javaBin);

        if (!javaExists) {
            console.error('[PDFA3B] Java not found at:', this.javaBin);
        }
        if (!jarExists) {
            console.error('[PDFA3B] PDFBox JAR not found at:', jarFile);
        }
        if (!classExists) {
            console.error('[PDFA3B] Service class not found at:', classFile);
        }

        return javaExists && jarExists && classExists;
    }
}

module.exports = new PDFA3BService();
