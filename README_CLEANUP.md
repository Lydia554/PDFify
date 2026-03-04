# How to Fix Shopify Webhooks - Easiest Way

## Your Architecture
- **ShopConfig = User** (each shop config is a separate merchant/user)
- **User model** = Used for old shopify.html connector app (different system)
- The failing webhooks are from your OLD test, not the embedded app

## The Problem
Webhooks are registered with the WRONG secret. Old ones use `SHOPIFY_WEBHOOK_SECRET`, but your code expects `SHOPIFY_API_SECRET`.

## Solution: EASIEST WAY (No Scripts Needed)

### Step 1: Go to Shopify Partners Dashboard
1. Visit https://partners.shopify.com
2. Click "Apps" → Select "PDFify Pro"
3. Click "App settings" → Scroll to "Webhooks"

### Step 2: Delete All Webhooks Manually
You'll see a list of webhooks. Delete each one by:
1. Clicking the webhook
2. Clicking "Delete webhook"
3. Confirming deletion

Delete ALL webhooks listed there.

### Step 3: Reinstall the App
1. In Shopify Partners, click "Test app"
2. Click "Install app" on your test store
3. Webhooks will be registered via `shopify.app.toml` with the CORRECT secret

### Step 4: Test
```bash
node test-all-webhooks.js
```

Should see: `🎉 ALL WEBHOOKS PASSED!`

## Why This Works
When you reinstall the app, Shopify reads your `shopify.app.toml` file and automatically registers the webhooks using the **API secret** (not the webhook secret). This matches what your code expects.

## After Fix
Submit to Shopify App Store. Both checks should pass:
- ✅ Provides mandatory compliance webhooks
- ✅ Verifies webhooks with HMAC signatures

---

**That's it!** No scripts, no database access, just manual deletion in Shopify dashboard.
