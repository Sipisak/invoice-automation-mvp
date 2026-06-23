$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$nodeMajor = (node -v) -replace 'v(\d+).*','$1'
if ($nodeMajor -ne "18") {
  Write-Warning "Node $nodeMajor detected. SPFx needs Node 18. Run 'nvm use 18'."
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host "Installing pnpm..."; npm i -g pnpm
}

Write-Host "==> pnpm install"
pnpm install
Write-Host "==> prisma generate + migrate"
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate

Write-Host ""
Write-Host "Done. Start the backend:  pnpm api:dev   (http://localhost:7071/api/health)"
Write-Host "Scaffold the web app:     see apps/web/README.md"
