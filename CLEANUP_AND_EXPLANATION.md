# What's Happening & How to Fix

## The Problem

Your Shopify webhooks are failing HMAC verification because:

1. **Old webhooks were registered manually** (via API) with `SHOPIFY_WEBHOOK_SECRET`
2. **Your new code expects webhooks from TOML** signed with `SHOPIFY_API_SECRET`
3. These are TWO DIFFERENT SECRETS, so HMAC verification fails

From your logs:
```
❌ [Webhook] HMAC VERIFICATION FAILED
Generated HMAC: 7I7TF5Dp6lmBEXUuNV3oDQNt1G5W5I...
Received HMAC:  kDXWeDcGgIe9fvof8J/60LBmNb0UJM...
```

## The Solution

Delete the old webhooks so the app can re-register them via `shopify.app.toml` with the correct secret.

## Is This Allowed? (Shopify Docs)

YES! According to Shopify's official documentation:

**Admin API Reference - Webhook:**
- DELETE endpoint: `/admin/api/2026-01/webhooks/{webhook_id}.json`
- Docs: https://shopify.dev/docs/api/admin-rest/2026-01/resources/webhook#delete-webhook-2021-07

**You CAN delete webhooks via API.** This is a standard operation.

## How to Fix (3 Simple Steps)

### Step 1: Get Your Access Token

1. Go to https://partners.shopify.com
2. Click "Apps" → Select your test store
3. Find "Admin API access token"
4. Click "Reveal" and copy it (starts with `shpat_`)

### Step 2: Run the Cleanup Script

```bash
node cleanup-webhooks.js
```

The script will:
- List all existing webhooks
- Ask you to confirm
- Delete them all

### Step 3: Reinstall the App

1. Go to Shopify Partners → Your App
2. Click "Test app" → "Install on test store"
3. The app will re-register webhooks via TOML with the correct secret

## Verify It Works

After reinstalling, run:

```bash
node test-all-webhooks.js
```

All 5 webhooks should pass, and your server logs should show:

```
✅ [Webhook] HMAC VERIFIED SUCCESSFULLY
```

Instead of:

```
❌ [Webhook] HMAC VERIFICATION FAILED
```

## Why Your Database Shows No Users

The debug endpoint shows "No users found" because:
- Your `ShopConfig` has shop domains
- But your `User` collection doesn't have matching records with access tokens
- This might be because the app was installed differently

That's why we need to use the manual cleanup approach with the access token from Shopify Partners.

---

**Bottom line:** Delete old webhooks → Reinstall app → Webhooks work with correct secret → Submit to App Store ✅
