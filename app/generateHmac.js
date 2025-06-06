// save this as generateHmac.js

const crypto = require('crypto');

const secret = 'a514125f3e4f3cbaac61103f1a05aed423b8c079b11d8d18f8faac1430589fd5'; // your actual secret
const body = `{
  "id": 123456789,
  "email": "customer@example.com",
  "created_at": "2025-06-06T10:00:00-04:00",
  "line_items": [
    { "name": "Sample Product", "quantity": 1, "price": "19.99" }
  ]
}`;
const hmac = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');

console.log('X-Shopify-Hmac-Sha256:', hmac);
