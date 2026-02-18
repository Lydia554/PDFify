const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/**
 * Java PDF/A-3B Service Client
 * Wraps the Java service for creating compliant PDFs
 */

// Java service configuration
const JAVA_SERVICE_CONFIG = {
    baseURL: process.env.JAVA_PDF_SERVICE_URL || 'http://localhost:8080',
    timeout: 30000, // 30 seconds
    maxRetries: 2
};

/**
 * Create PDF/A-3b invoice using Java service
 * @param {object} invoiceData - Invoice data
 * @param {string} filename - Output filename (optional)
 * @returns {Promise<Buffer>} PDF buffer
 */
async function createPdfA3WithJava(invoiceData, filename = null) {
    console.log('[Java Service] Creating PDF/A-3b invoice via Java service...');

    const requestId = `pdfa3b-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
        // Call Java service
        const response = await axios.post(`${JAVA_SERVICE_CONFIG.baseURL}/create`, {
            jsonrpc: '2.0',
            id: requestId,
            method: 'createPDFA3B',
            params: {
                orderId: invoiceData.orderId || 'INV-' + Date.now(),
                date: invoiceData.date || new Date().toISOString().split('T')[0],
                customerName: invoiceData.customerName || 'Customer',
                customerEmail: invoiceData.customerEmail || '',
                customerAddress: invoiceData.customerAddress || '',
                companyName: invoiceData.companyName || 'Your Company',
                shopName: invoiceData.shopName || '',
                shopAddress: invoiceData.shopAddress || '',
                items: invoiceData.items || [],
                subtotal: invoiceData.subtotal || 0,
                tax: invoiceData.tax || 0,
                total: invoiceData.total || 0,
                currency: invoiceData.currency || 'EUR',
                vatRate: invoiceData.vatRate || 21,
                iban: invoiceData.iban || '',
                bic: invoiceData.bic || '',
                bankName: invoiceData.bankName || '',
                paymentTerms: invoiceData.paymentTerms || 'Due within 14 days',
                creator: invoiceData.creator || 'PDFify',
                locale: invoiceData.locale || { language: 'en' },
                primaryColor: invoiceData.primaryColor || '#00a6cc', // Custom color
                filename: filename || `Invoice_${invoiceData.orderId || 'draft'}.pdf`
            }
        }, {
            timeout: JAVA_SERVICE_CONFIG.timeout,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/pdf'
            },
            responseType: 'arraybuffer',
            // Important: Don't throw on error status so we can read the error response
            validateStatus: function (status) {
                return status >= 200 && status < 600; // Allow all responses to be read
            }
        });

        // Check if the response indicates an error
        if (response.status !== 200) {
            // Try to parse error response as JSON
            let errorMessage = `Java service returned status ${response.status}`;

            try {
                // The response is an arraybuffer, try to decode it
                const responseText = Buffer.from(response.data).toString('utf-8');
                const errorData = JSON.parse(responseText);

                if (errorData.error) {
                    errorMessage = `Java service error: ${errorData.error}`;
                }
            } catch (parseError) {
                // If we can't parse as JSON, use the status code
                console.warn('[Java Service] Could not parse error response as JSON');
            }

            console.error('[Java Service]', errorMessage);
            throw new Error(errorMessage);
        }

        // Check for JSON-RPC error in successful response
        if (response.data && response.data.length > 0) {
            try {
                const responseText = Buffer.from(response.data).toString('utf-8');
                const jsonData = JSON.parse(responseText);

                if (jsonData.error) {
                    throw new Error(`Java service error: ${jsonData.error}`);
                }
            } catch (parseError) {
                // Not JSON, so it's probably the PDF binary data - this is expected
            }
        }

        console.log(`[Java Service] PDF created successfully, size: ${response.data.length} bytes`);

        // Return PDF buffer
        return Buffer.from(response.data);

    } catch (err) {
        console.error('[Java Service] Request failed:', err.message);

        if (err.code === 'ECONNREFUSED') {
            throw new Error('Java PDF service is not running. Please start the service first.');
        }

        throw err;
    }
}

/**
 * Validate that Java service is running
 * @returns {Promise<boolean>}
 */
async function checkJavaServiceHealth() {
    try {
        const response = await axios.get(`${JAVA_SERVICE_CONFIG.baseURL}/health`, {
            timeout: 5000
        });
        return response.data?.status === 'ok';
    } catch (err) {
        console.warn('[Java Service] Health check failed:', err.message);
        return false;
    }
}

/**
 * Get Java service status
 * @returns {Promise<object>}
 */
async function getJavaServiceStatus() {
    try {
        const response = await axios.get(`${JAVA_SERVICE_CONFIG.baseURL}/status`, {
            timeout: 5000
        });
        return {
            running: true,
            version: response.data?.version || 'unknown',
            uptime: response.data?.uptime || 0
        };
    } catch (err) {
        return {
            running: false,
            version: 'unknown',
            uptime: 0,
            error: err.message
        };
    }
}

/**
 * Start Java service (if not running)
 * @returns {Promise<void>}
 */
async function ensureJavaServiceRunning() {
    const isRunning = await checkJavaServiceHealth();

    if (!isRunning) {
        console.log('[Java Service] Not running, attempting to start...');
        try {
            // Check if service script exists
            const serviceScript = path.join(__dirname, '../../java/run.sh');
            const serviceScriptWin = path.join(__dirname, '../../java/run.bat');

            const scriptExists = fs.existsSync(serviceScript) || fs.existsSync(serviceScriptWin);

            if (!scriptExists) {
                console.warn('[Java Service] No run script found. Please start Java service manually.');
                return;
            }

            // Start the service
            const isWindows = process.platform === 'win32';
            const script = isWindows ? serviceScriptWin : serviceScript;

            console.log(`[Java Service] Starting: ${script}`);

            // Wait for service to be ready
            await new Promise((resolve) => {
                let attempts = 0;
                const maxAttempts = 30; // 30 seconds

                const checker = setInterval(async () => {
                    attempts++;
                    const healthy = await checkJavaServiceHealth();

                    if (healthy || attempts >= maxAttempts) {
                        clearInterval(checker);
                        resolve(healthy ? 'started' : 'timeout');
                    }
                }, 1000);
            });

        } catch (err) {
            console.error('[Java Service] Failed to start:', err.message);
        }
    } else {
        console.log('[Java Service] Already running');
    }
}

module.exports = {
    createPdfA3WithJava,
    checkJavaServiceHealth,
    getJavaServiceStatus,
    ensureJavaServiceRunning,
    JAVA_SERVICE_CONFIG
};
