<#
  weownit.net: prepare Cloudflare D1 for the newsletter.
  Run from a trusted Windows PowerShell terminal, on the feature branch.
  This script NEVER deploys the Worker, merges GitHub, sets API secrets or sends mail.
  Cloudflare account login is provided by Wrangler (npx wrangler login) outside this script.
#>
[CmdletBinding()]
param(
  [switch]$ApplyRemoteMigration
)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is required. Install it before running this script."
}
$npx = if (Get-Command npx.cmd -ErrorAction SilentlyContinue) {
  (Get-Command npx.cmd).Source
} elseif (Get-Command npx -ErrorAction SilentlyContinue) {
  (Get-Command npx).Source
} else { throw "npx is required." }

Write-Host ""
Write-Host "weownit.net / Cloudflare D1 setup" -ForegroundColor Cyan
Write-Host "This will CREATE an EU-jurisdiction Cloudflare D1 database and update worker/wrangler.jsonc."
Write-Host "It will NOT deploy or send subscriber email."
$confirmation = Read-Host "Type CREATE to continue"
if ($confirmation -cne "CREATE") {
  Write-Host "Cancelled without changes."
  exit 0
}

Write-Host "Creating D1 and writing its binding to wrangler.jsonc..."
& $npx wrangler d1 create weownit_subscribers --binding SUBSCRIBERS_DB --jurisdiction eu --update-config
if ($LASTEXITCODE -ne 0) {
  throw "D1 creation failed. If the database already exists, follow worker/NEWSLETTER.md to bind its real ID manually."
}

if ($ApplyRemoteMigration) {
  Write-Host "Applying newsletter migration to remote D1..."
  & $npx wrangler d1 migrations apply weownit_subscribers --remote
  if ($LASTEXITCODE -ne 0) { throw "Remote migration failed. No Worker deployment occurred." }
} else {
  Write-Host "Next step (after review): npx wrangler d1 migrations apply weownit_subscribers --remote"
}

Write-Host ""
Write-Host "D1 preparation finished. Inspect worker/wrangler.jsonc before committing." -ForegroundColor Green
Write-Host "Cloudflare Turnstile, Resend segments, secrets and real email validation are still required."
Write-Host "No deployment was performed."
