# Rebuilds the web client (only needed after changing files in web\src). Requires Node.js 18+.
$web = Join-Path (Split-Path -Parent $PSScriptRoot) "web"
Set-Location $web
npm install
npm run build
