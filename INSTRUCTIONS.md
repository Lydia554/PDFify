# Fix Shopify Webhook HMAC Issues

## What Was the Problem?

Your webhooks were failing because you had **old webhooks registered** in Shopify that were signed with a different secret than your `SHOPIFY_API_SECRET`.

From your logs:
- ✅ Test webhooks (your script): HMAC verification PASSED
- ❌ Real Shopify webhooks: HMAC verification FAILED (different secret)

## Solution Implemented

I've created a cleanup utility that will:
1. Find all existing webhooks in your Shopify store
2. Delete them all
3. Allow the `shopify.app.toml` to re-register them with the correct secret

## What You Need to Do

### 1. Wait for GitHub Actions Deployment

Your code is pushed to GitHub (commit `2825abb5`). Wait for GitHub Actions to deploy it to production.

### 2. Run the Cleanup Script

Once deployment is complete, run:

```bash
node run-cleanup.js
```

This will:
- Call the new `/api/shopify/util/cleanup-webhooks` endpoint
- Delete all old webhooks from your test store
- Show you which webhooks were deleted

### 3. Reinstall the App on Your Test Store

After cleanup, either:
- **Option A**: Reinstall the app on your test store (recommended)
- **Option B**: Run `shopify app deploy` if you have CLI set up

This will re-register the webhooks via `shopify.app.toml` with the correct secret.

### 4. Verify It's Working

Run the test script again:

```bash
node test-all-webhooks.js
```

You should see:
```
🎉 ALL WEBHOOKS PASSED!
✅ Passed: 5/5
```

And in your server logs, real Shopify webhooks should now show:
```
✅ [Webhook] HMAC VERIFIED SUCCESSFULLY
```

Instead of:
```
❌ [Webhook] HMAC VERIFICATION FAILED
```

## Files Added

1. **`app/server/routes/shopify/cleanupWebhooks.js`** - Cleanup endpoint
2. **`run-cleanup.js`** - Script to trigger cleanup
3. **`test-webhook.js`** - Test single webhook with valid HMAC
4. **`test-all-webhooks.js`** - Test all 5 webhooks
5. **`.env`** - Added `SHOPIFY_API_SECRET` variable
6. **`.env.example`** - Documentation of all required variables
7. **`DEPLOYMENT_GUIDE.md`** - Complete deployment documentation

## Expected Timeline

1. GitHub Actions deploys: ~2-5 minutes
2. Run cleanup script: ~10 seconds
3. Reinstall app: ~1 minute
4. Test webhooks: ~10 seconds

Total: ~5-10 minutes to fix everything

## After Fix is Complete

Once webhooks are passing, submit to Shopify App Store review again. Both checks should now pass:
- ✅ Provides mandatory compliance webhooks
- ✅ Verifies webhooks with HMAC signatures

---

**Quick Command Reference:**
```bash
# Wait for deployment, then:
node run-cleanup.js

# Reinstall app (via Shopify Partners dashboard or CLI)

# Test webhooks
node test-all-webhooks.js
```
