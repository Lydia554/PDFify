const axios = require("axios");

async function sendShopifyInvoiceEmail({ shopDomain, order, pdfBuffer, accessToken }) {
  if (!shopDomain || !order || !pdfBuffer || !accessToken) {
    console.error("❌ Missing required parameters for Shopify invoice email");
    return false;
  }

  try {
    const base64PDF = pdfBuffer.toString("base64");
    
    const url = `https://${shopDomain}/admin/api/2023-10/orders/${order.id}/send_invoice.json`;

    const payload = {
      email: order.email,
      bcc: [],
      attachments: [
        {
          name: `Invoice-${order.name || order.id}.pdf`,
          data: base64PDF
        }
      ]
    };

    const response = await axios.post(url, payload, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json"
      }
    });

    console.log(`✅ Shopify email sent for order ${order.id}`);
    return response.data;
  } catch (err) {
    console.error("❌ Failed to send Shopify email:", err.response?.data || err.message);
    return false;
  }
}

module.exports = sendShopifyInvoiceEmail;
