# PowerShell script to delete invalid Shopify webhooks

Write-Host "=== Shopify Webhook Deletion Script ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "STEP 1: Get your Admin API Access Token" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host "Run this command in a SEPARATE PowerShell window:" -ForegroundColor White
Write-Host "  cd C:\Users\goldb\Pro\PDF-API\app" -ForegroundColor Cyan
Write-Host "  shopify app token" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will show you your Admin API Access Token (starts with 'shpat_')" -ForegroundColor White
Write-Host ""

$accessToken = Read-Host "Paste your Admin API access token here (or press Ctrl+C to cancel)"

if ([string]::IsNullOrWhiteSpace($accessToken)) {
    Write-Host "No token provided. Exiting." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "STEP 2: Fetching registered webhooks..." -ForegroundColor Yellow

$query = @"
query {
  webhookSubscriptions(first: 50) {
    edges {
      node {
        id
        topic
        endpoint {
          url
        }
        status
      }
    }
  }
}
"@

$headers = @{
    "Content-Type" = "application/json"
    "X-Shopify-Access-Token" = $accessToken
    "X-Shopify-API-Caller-Type" = "CLI"
}

try {
    $response = Invoke-RestMethod -Uri "https://partners.shopify.com/api/2024-10/graphql.json" -Method Post -Body (@{query = $query} | ConvertTo-Json) -Headers $headers

    $webhooks = $response.data.webhookSubscriptions.edges

    if ($webhooks.Count -eq 0) {
        Write-Host "No webhooks found!" -ForegroundColor Green
        exit 0
    }

    Write-Host "Found $($webhooks.Count) webhooks:" -ForegroundColor Cyan
    Write-Host ""

    # Display webhooks
    $gdprWebhooks = @()
    foreach ($edge in $webhooks) {
        $node = $edge.node
        Write-Host "  - $($node.topic)" -ForegroundColor White
        Write-Host "    ID: $($node.id)" -ForegroundColor Gray
        Write-Host "    Endpoint: $($node.endpoint.url)" -ForegroundColor Gray
        Write-Host ""

        if ($node.topic -match "customers/(data_request|redact)" -or $node.topic -eq "shop/redact") {
            $gdprWebhooks += $node
        }
    }

    if ($gdprWebhooks.Count -eq 0) {
        Write-Host "No GDPR webhooks found to delete." -ForegroundColor Green
        exit 0
    }

    Write-Host "Found $($gdprWebhooks.Count) GDPR webhooks to delete:" -ForegroundColor Yellow
    foreach ($webhook in $gdprWebhooks) {
        Write-Host "  - $($webhook.topic) ($($webhook.id))" -ForegroundColor Red
    }

    $confirm = Read-Host "`nDelete these webhooks? (y/n)"
    if ($confirm -ne "y") {
        Write-Host "Cancelled." -ForegroundColor Yellow
        exit 0
    }

    Write-Host ""
    Write-Host "STEP 3: Deleting webhooks..." -ForegroundColor Yellow

    foreach ($webhook in $gdprWebhooks) {
        $mutation = @"
mutation webhookDelete(`$id: ID!) {
  webhookDelete(id: `$id) {
    deletedWebhookId
    userErrors {
      field
      message
    }
  }
}
"@

        try {
            $deleteResponse = Invoke-RestMethod -Uri "https://partners.shopify.com/api/2024-10/graphql.json" -Method Post -Body (@{query = $mutation; variables = @{id = $webhook.id}} | ConvertTo-Json -Depth 3) -Headers $headers

            if ($deleteResponse.data.webhookDelete.userErrors.Count -gt 0) {
                Write-Host "  ❌ Failed to delete $($webhook.topic): $($deleteResponse.data.webhookDelete.userErrors[0].message)" -ForegroundColor Red
            } else {
                Write-Host "  ✅ Deleted: $($webhook.topic)" -ForegroundColor Green
            }
        } catch {
            Write-Host "  ❌ Error deleting $($webhook.topic): $($_.Exception.Message)" -ForegroundColor Red
        }
    }

    Write-Host ""
    Write-Host "✅ Done! Now run:" -ForegroundColor Green
    Write-Host "  cd C:\Users\goldb\Pro\PDF-API\app" -ForegroundColor Cyan
    Write-Host "  shopify app deploy --allow-updates --allow-deletes --no-build" -ForegroundColor Cyan

} catch {
    Write-Host ""
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "1. Make sure you copied the ENTIRE token (starts with 'shpat_')" -ForegroundColor White
    Write-Host "2. The token should be from 'Admin API Access Token' line" -ForegroundColor White
    Write-Host "3. Make sure you're using the correct app (PDFify Pro)" -ForegroundColor White
    exit 1
}
