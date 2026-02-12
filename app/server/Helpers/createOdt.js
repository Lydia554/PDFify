const fs = require('fs');
const path = require('path');

/**
 * Create a proper ODT template file (not FODT)
 * LibreOffice handles ODT much better for PDF/A-3B export
 */
function createProperOdt(data) {
    const { orderId, date, customerName, companyName, items = [], total, currency = 'EUR' } = data;

    // ODT is a ZIP file with specific structure
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();

    // 1. mimetype (must be first, uncompressed, stored as raw bytes)
    const mimetypeContent = 'application/vnd.oasis.opendocument.text';
    zip.addFile('mimetype', Buffer.from(mimetypeContent, 'utf-8'));

    // 2. META-INF/manifest.xml
    const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
  <manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`;

    // 3. meta.xml
    const meta = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
                      xmlns:dc="http://purl.org/dc/elements/1.1/"
                      office:version="1.2">
  <office:meta>
    <dc:creator>PDF-API</dc:creator>
    <dc:date>${new Date().toISOString()}</dc:date>
    <dc:title>Invoice ${orderId}</dc:title>
  </office:meta>
</office:document-meta>`;

    // 4. content.xml - the actual document content
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content
    xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
    xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
    xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
    xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
    office:version="1.2">
  <office:automatic-styles>
    <style:style style:name="Standard" style:family="paragraph">
      <style:text-properties fo:font-family="Arial" fo:font-size="12pt"/>
    </style:style>
    <style:style style:name="Heading" style:family="paragraph">
      <style:text-properties fo:font-family="Arial" fo:font-size="16pt" fo:font-weight="bold"/>
    </style:style>
  </office:automatic-styles>
  <office:body>
    <office:text>
      <text:h text:style-name="Heading">Invoice: ${orderId}</text:h>
      <text:p text:style-name="Standard">Date: ${date}</text:p>
      <text:p text:style-name="Standard"/>
      <text:p text:style-name="Standard">Seller: ${companyName}</text:p>
      <text:p text:style-name="Standard">Buyer: ${customerName}</text:p>
      <text:p text:style-name="Standard"/>
      ${items.map(item => `
        <text:p text:style-name="Standard">${item.name} x ${item.quantity} = ${item.price.toFixed(2)} ${currency}</text:p>
      `).join('')}
      <text:p text:style-name="Standard"/>
      <text:p text:style-name="Standard"><text:span text:style-name="Heading">Total: ${total.toFixed(2)} ${currency}</text:span></text:p>
    </office:text>
  </office:body>
</office:document-content>`;

    // 5. styles.xml
    const styles = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles
    xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
    xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
    xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
    office:version="1.2">
  <office:styles>
    <style:default-style style:family="paragraph">
      <style:text-properties fo:font-family="Arial" fo:font-size="12pt"/>
    </style:default-style>
    <style:style style:name="Standard" style:family="paragraph">
      <style:text-properties fo:font-family="Arial" fo:font-size="12pt"/>
    </style:style>
    <style:style style:name="Heading" style:family="paragraph">
      <style:text-properties fo:font-family="Arial" fo:font-size="16pt" fo:font-weight="bold"/>
    </style:style>
  </office:styles>
  <office:automatic-styles>
    <style:page-layout style:name="pm1">
      <style:page-layout-properties fo:page-width="210mm" fo:page-height="297mm"
                                  fo:margin-top="20mm" fo:margin-bottom="20mm"
                                  fo:margin-left="20mm" fo:margin-right="20mm"/>
    </style:page-layout>
  </office:automatic-styles>
  <office:master-styles>
    <style:master-page style:name="Standard" style:page-layout-name="pm1"/>
  </office:master-styles>
</office:document-styles>`;

    // Add all files to ZIP (as Buffers)
    zip.addFile('META-INF/manifest.xml', Buffer.from(manifest, 'utf-8'));
    zip.addFile('meta.xml', Buffer.from(meta, 'utf-8'));
    zip.addFile('content.xml', Buffer.from(content, 'utf-8'));
    zip.addFile('styles.xml', Buffer.from(styles, 'utf-8'));

    const odtBuffer = zip.toBuffer();

    return odtBuffer;
}

module.exports = { createProperOdt };
