const FormData = require('form-data');
const axios = require('axios');

/**
 * Generate PDF/A-3b compliant PDF with embedded ZUGFeRD XML
 * using the Python factur-x service
 *
 * @param {Buffer} pdfBuffer - Input PDF buffer
 * @param {Object} invoiceData - Invoice data
 * @param {string} xmlContent - Pre-generated ZUGFeRD XML string
 * @returns {Promise<Buffer>} PDF/A-3b compliant PDF buffer
 */
async function generateZugferdPdf(pdfBuffer, invoiceData, xmlContent) {
  const serviceUrl = process.env.ZUGFERD_SERVICE_URL || 'http://python-service:5000';

  try {
    const form = new FormData();

    // Attach PDF file
    form.append('pdfFile', pdfBuffer, {
      filename: `invoice-${invoiceData.orderId || 'unknown'}.pdf`,
      contentType: 'application/pdf'
    });

    // Attach invoice data with XML content
    const invoiceDataPayload = {
      ...invoiceData,
      xmlContent: xmlContent  // Pre-generated XML from Node.js
    };

    form.append('invoiceData', JSON.stringify(invoiceDataPayload));

    const orderId = invoiceData.orderId || 'unknown';
    console.log(`🔄 Calling ZUGFeRD service at ${serviceUrl}/generate-zugferd for order: ${orderId}`);

    const response = await axios.post(
      `${serviceUrl}/generate-zugferd`,
      form,
      {
        headers: {
          ...form.getHeaders()
        },
        responseType: 'arraybuffer',
        timeout: 30000,  // 30 second timeout
        maxContentLength: 50 * 1024 * 1024,  // 50MB max
        maxBodyLength: 50 * 1024 * 1024
      }
    );

    console.log(`✅ ZUGFeRD PDF generated successfully for order: ${orderId}`);
    console.log(`   Output size: ${response.data.byteLength} bytes`);

    return Buffer.from(response.data);

  } catch (error) {
    console.error('❌ ZUGFeRD service error:', error.message);

    if (error.response) {
      console.error('   Response status:', error.response.status);
      console.error('   Response data:', error.response.data ?
        error.response.data.toString().substring(0, 500) : 'No data');

      // Try to parse error response
      try {
        const errorData = JSON.parse(error.response.data.toString());
        throw new Error(`ZUGFeRD service error: ${errorData.error} - ${errorData.details || ''}`);
      } catch (parseError) {
        throw new Error(`ZUGFeRD generation failed: ${error.message}`);
      }
    }

    if (error.code === 'ECONNREFUSED') {
      throw new Error('ZUGFeRD service is not available. Please ensure Python service is running.');
    }

    if (error.code === 'ETIMEDOUT') {
      throw new Error('ZUGFeRD service timeout. PDF generation took too long.');
    }

    throw new Error(`ZUGFeRD generation failed: ${error.message}`);
  }
}

/**
 * Check if Python ZUGFeRD service is available
 * @returns {Promise<boolean>} true if service is healthy, false otherwise
 */
async function checkZugferdServiceHealth() {
  const serviceUrl = process.env.ZUGFERD_SERVICE_URL || 'http://python-service:5000';

  try {
    const response = await axios.get(`${serviceUrl}/health`, {
      timeout: 5000
    });

    if (response.data.status === 'ok') {
      console.log(`✅ ZUGFeRD service is healthy`);
      console.log(`   Service: ${response.data.service}`);
      console.log(`   factur-x version: ${response.data.facturx_version || 'unknown'}`);
      return true;
    }

    return false;
  } catch (error) {
    console.warn('⚠️  ZUGFeRD service not available:', error.message);
    return false;
  }
}

/**
 * Wrapper function with fallback to Node.js implementation
 * @param {Buffer} pdfBuffer - Input PDF buffer
 * @param {Object} invoiceData - Invoice data
 * @param {string} xmlContent - Pre-generated ZUGFeRD XML string
 * @param {Function} fallbackFn - Fallback function if Python service unavailable
 * @returns {Promise<Buffer>} PDF/A-3b compliant PDF buffer
 */
async function generateZugferdPdfWithFallback(pdfBuffer, invoiceData, xmlContent, fallbackFn) {
  const pythonServiceAvailable = await checkZugferdServiceHealth();

  if (pythonServiceAvailable) {
    try {
      console.log('✅ Using Python factur-x service for PDF/A-3b compliance');
      return await generateZugferdPdf(pdfBuffer, invoiceData, xmlContent);
    } catch (error) {
      console.error('❌ Python service failed:', error.message);

      if (fallbackFn) {
        console.warn('⚠️  Falling back to Node.js implementation');
        return await fallbackFn(pdfBuffer, invoiceData);
      }

      throw error;
    }
  } else {
    if (fallbackFn) {
      console.warn('⚠️  Python service unavailable, using Node.js fallback');
      return await fallbackFn(pdfBuffer, invoiceData);
    }

    throw new Error('ZUGFeRD service is not available and no fallback provided');
  }
}

module.exports = {
  generateZugferdPdf,
  checkZugferdServiceHealth,
  generateZugferdPdfWithFallback
};
