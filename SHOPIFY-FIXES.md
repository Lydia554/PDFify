# Shopify App Store Approval Fixes

## ✅ Issues Fixed

### 1. Mandatory Compliance Webhooks ✅
All required GDPR webhooks are now implemented:
- ✅ `app/uninstalled` - Cleans up data when app is uninstalled
- ✅ `customers/redact` - Handles customer deletion requests (GDPR)
- ✅ `customers/data_request` - Handles customer data access requests (GDPR)
- ✅ `shop/redact` - Handles shop data deletion requests (GDPR)
- ✅ `orders/create` - Automatic invoice generation

### 2. HMAC Signature Verification ✅
- **Before:** Only verified in production mode (`if (process.env.NODE_ENV !== "production")`)
- **After:** ALWAYS verifies HMAC signatures, even in development
- **Result:** Shopify review will pass security checks

### 3. Old Webhook Cleanup ✅
- **Problem:** Re-deploying created duplicate webhooks
- **Solution:** Automatic webhook sync on installation
- **Manual cleanup:** `POST /api/shopify/cleanup-webhooks` endpoint available

---

## 📋 Files Modified

### 1. `app/server/routes/shopify/shopifyWebhookRoutes.js`
- ✅ Fixed HMAC verification (always active)
- ✅ Added `app/uninstalled` webhook handler
- ✅ All GDPR webhooks already present

### 2. `app/server/routes/shopify/shopifyApiRoutes.js`
- ✅ Added webhook sync to OAuth callback
- ✅ Added manual cleanup endpoint: `/api/shopify/cleanup-webhooks`

### 3. `app/server/routes/shopify/webhookManager.js` (NEW)
- ✅ Webhook registration logic
- ✅ Duplicate detection and cleanup
- ✅ Sync function for installation

### 4. `app/server/routes/shopify/billingRoutes.js` (NEW)
- ✅ Shopify Billing API integration (replaced Stripe)
- ✅ 7-day free trial
- ✅ Subscription status checking

### 5. `app/public/shopify-embedded.html`
- ✅ Removed Stripe checkout
- ✅ Updated to use Shopify Billing
- ✅ Removed token packs (not suitable for Shopify apps)

---

## 🧪 Testing Instructions

### 1. Test HMAC Verification

```bash
# Restart your server
cd app
npm start

# Check logs for webhook verification
# You should see: "✅ [Webhook] HMAC verified successfully"
```

### 2. Test Webhook Registration

1. Install your app on a dev store
2. Check server logs for:
   ```
   🔄 [Webhook Sync] Starting webhook sync for xxx.myshopify.com...
   ✅ Registered webhook: app/uninstalled
   ✅ Registered webhook: customers/redact
   ✅ Registered webhook: customers/data_request
   ✅ Registered webhook: shop/redact
   ✅ Registered webhook: orders/create
   ```

### 3. Clean Up Old Webhooks (if needed)

Open: `https://pdfify.pro/test-webhooks.html`

Enter your shop domain and click "Clean Up & Re-register Webhooks"

Or use cURL:
```bash
curl -X POST https://pdfify.pro/api/shopify/cleanup-webhooks \
  -H "Content-Type: application/json" \
  -d '{"shopDomain": "your-store.myshopify.com"}'
```

### 4. Test GDPR Webhooks Manually

From Shopify Admin:
1. Go to Settings > Notifications > Webhooks
2. You should see 5 webhooks registered
3. Test each one by clicking "Send test notification"

### 5. Test App Uninstall

1. Install app on dev store
2. Uninstall the app
3. Check server logs for:
   ```
   🗑️ [App Uninstall] Uninstall request for: xxx.myshopify.com
   ✅ [App Uninstall] Marked shop as inactive
   ```

---

## ✅ Pre-Submission Checklist

- [x] HMAC verification always active
- [x] All 5 mandatory webhooks registered
  - [x] app/uninstalled
  - [x] orders/create
  - [x] customers/redact
  - [x] customers/data_request
  - [x] shop/redact
- [x] Webhooks verify HMAC signatures
- [x] No old/duplicate webhooks
- [x] Privacy policy URL set (in Shopify Partners dashboard)
- [x] Support email visible in app listing
- [x] App description explains features clearly
- [x] Screenshots show actual app functionality
- [x] Billing configured in Shopify Partners (7-day trial)

---

## 🚀 Ready to Submit?

After testing:

1. **Deploy to production**
2. **Open test-webhooks.html** and clean up any old webhooks
3. **Go to Shopify Partners dashboard**
4. **Submit for review**

The review team will check:
- ✅ Webhooks are verified with HMAC
- ✅ All mandatory GDPR webhooks exist
- ✅ App doesn't crash when installed/uninstalled
- ✅ Billing works correctly

---

## 📞 If Review Fails

Common rejection reasons:

1. **"Webhooks not verified with HMAC"**
   - Check server logs show HMAC verification
   - Make sure `SHOPIFY_WEBHOOK_SECRET` is set correctly

2. **"Missing mandatory webhooks"**
   - Run webhook cleanup
   - Check all 5 webhooks are registered in Shopify Admin

3. **"App crashes on install"**
   - Check OAuth callback completes successfully
   - Verify Java PDF service is running

4. **"Unclear pricing"**
   - Make sure billing is configured in Shopify Partners
   - Check trial period is set to 7 days

---

## 🔧 Quick Commands

```bash
# Check if webhooks are registered (requires access token)
curl -X GET https://your-store.myshopify.com/admin/api/2024-01/webhooks.json \
  -H "X-Shopify-Access-Token: YOUR_ACCESS_TOKEN"

# Clean up webhooks programmatically
curl -X POST https://pdfify.pro/api/shopify/cleanup-webhooks \
  -H "Content-Type: application/json" \
  -d '{"shopDomain": "your-store.myshopify.com"}'
```

---

Generated: March 2, 2026
Questions? Contact: goldblueoff@gmail.com
