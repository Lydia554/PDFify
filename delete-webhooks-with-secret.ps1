# Script to delete Shopify webhooks using Client Secret authentication
# This uses Shopify's Partner API to authenticate and delete webhooks

$CLIENT_ID = "e07548c088f572af4bbf103e4dee46bb"
$CLIENT_SECRET = "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"
$ORG_ID = "145227133"
$APP_ID = "325530976257"

Write-Host "=== Shopify Webhook Deletion (Partner API) ===" -ForegroundColor Cyan
Write-Host ""

# First, let's try to authenticate using the Partner API
Write-Host "Attempting to authenticate with Partner API..." -ForegroundColor Yellow

# Try using curl to get an access token
$authUrl = "https://accounts.shopify.com/oauth/token"
$authBody = @{
    client_id = $CLIENT_ID
    client_secret = $CLIENT_SECRET
    grant_type = "client_credentials"
}

try {
    $authResponse = Invoke-RestMethod -Uri $authUrl -Method Post -Body $authBody

    if ($authResponse.access_token) {
        Write-Host "✅ Got access token!" -ForegroundColor Green
        $accessToken = $authResponse.access_token

        Write-Host ""
        Write-Host "Fetching webhooks..." -ForegroundColor Yellow

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

        $response = Invoke-RestMethod -Uri "https://partners.shopify.com/api/2024-10/graphql.json" -Method Post -Body (@{query = $query} | ConvertTo-Json) -Headers $headers
        $webhooks = $response.data.webhookSubscriptions.edges

        Write-Host "Found $($webhooks.Count) webhooks:" -ForegroundColor Cyan
        Write-Host ""

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
            Write-Host "No GDPR webhooks found." -ForegroundColor Green
        } else {
            Write-Host "Found $($gdprWebhooks.Count) GDPR webhooks to delete:" -ForegroundColor Yellow
            foreach ($webhook in $gdprWebhooks) {
                Write-Host "  - $($webhook.topic) ($($webhook.id))" -ForegroundColor Red
            }

            $confirm = Read-Host "`nDelete these webhooks? (y/n)"
            if ($confirm -eq "y") {
                Write-Host ""
                Write-Host "Deleting webhooks..." -ForegroundColor Yellow

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
                            Write-Host "  ❌ Failed: $($deleteResponse.data.webhookDelete.userErrors[0].message)" -ForegroundColor Red
                        } else {
                            Write-Host "  ✅ Deleted: $($webhook.topic)" -ForegroundColor Green
                        }
                    } catch {
                        Write-Host "  ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
                    }
                }

                Write-Host ""
                Write-Host "✅ Done! Now run: shopify app deploy --allow-updates --allow-deletes --no-build" -ForegroundColor Green
            }
        }
    }
} catch {
    Write-Host ""
    Write-Host "❌ Authentication failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "The Client Secret alone isn't sufficient for Partner API access." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Alternative solution:" -ForegroundColor Cyan
    Write-Host "1. Go to: https://partners.shopify.com/$ORG_ID/apps/$APP_ID/settings" -ForegroundColor White
    Write-Host "2. Look for 'Admin API Access Token' section" -ForegroundColor White
    Write-Host "3. Generate or copy the token (starts with 'shpat_')" -ForegroundColor White
    Write-Host "4. Run: .\delete-webhooks.ps1" -ForegroundColor White
    Write-Host ""
    Write-Host "Or contact Shopify Support to manually delete the webhooks." -ForegroundColor Yellow
}
