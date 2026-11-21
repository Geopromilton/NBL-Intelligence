# Builds the NBL-Intelligence Windows installer and the update package.
# Used by GitHub Actions (windows-latest); also runs on a Windows PC with
# Python 3.12, Node.js 20 and Inno Setup 6 installed.
#   build\installer\NBL-Intelligence_Setup_<version>.exe   first install
#   build\nbl-intelligence-app.zip (+ .sha256)              in-app update package
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$version = (Get-Content VERSION -Raw).Trim()
$env:NBI_VERSION = $version
$build = Join-Path $root "build"
if (Test-Path $build) { Remove-Item $build -Recurse -Force }
New-Item -ItemType Directory -Path "$build\dist\app" -Force | Out-Null

# 1. web client
if (-not (Test-Path "web\dist\index.html")) {
  Push-Location web; npm ci; npm run build; Pop-Location
}

# 2. app folder (replaced by updates)
$app = "$build\dist\app"
Copy-Item backend "$app\backend" -Recurse
Copy-Item "web\dist" "$app\web\dist" -Recurse
New-Item -ItemType Directory "$app\sites" -Force | Out-Null
Get-ChildItem sites -Directory | ForEach-Object {
  New-Item -ItemType Directory "$app\sites\$($_.Name)" -Force | Out-Null
  Copy-Item "$($_.FullName)\site.yaml" "$app\sites\$($_.Name)\site.yaml"
}
Copy-Item requirements.txt, VERSION, README.md "$app\"
Get-ChildItem $app -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force

# 3. private Python runtime with the libraries
$py = Join-Path $env:pythonLocation "python.exe"
if (-not (Test-Path $py)) { $py = (Get-Command python).Source }
$pyRoot = Split-Path -Parent $py
Copy-Item $pyRoot "$build\dist\runtime" -Recurse
& "$build\dist\runtime\python.exe" -m pip install --disable-pip-version-check --no-warn-script-location -q -r requirements.txt
Copy-Item requirements.txt "$build\dist\installed_requirements.txt"
Get-ChildItem "$build\dist\runtime" -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$build\dist\runtime\Lib\site-packages\*\tests" -Recurse -Force -ErrorAction SilentlyContinue

# 4. launcher and icon
Copy-Item packaging\launch.pyw "$build\dist\launch.pyw"
Copy-Item assets\nbl-intelligence.ico "$build\dist\nbl-intelligence.ico"

# 5. smoke test: the packaged runtime imports the app
$env:NBL_INTELLIGENCE_INSTALLED = "1"
& "$build\dist\runtime\python.exe" -c "import sys; sys.path.insert(0, r'$app\backend'); import nbl_intelligence.api as a; print('import ok', a.__name__)"
Remove-Item Env:NBL_INTELLIGENCE_INSTALLED

# 6. update package
Compress-Archive -Path "$app\*" -DestinationPath "$build\nbl-intelligence-app.zip"
$hash = (Get-FileHash "$build\nbl-intelligence-app.zip" -Algorithm SHA256).Hash.ToLower()
Set-Content "$build\nbl-intelligence-app.zip.sha256" "$hash  nbl-intelligence-app.zip" -NoNewline

# 7. installer images and installer
& "$build\dist\runtime\python.exe" packaging\make_wizard_images.py $build
$iscc = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe"
if (-not (Test-Path $iscc)) { choco install innosetup -y --no-progress | Out-Null }
& $iscc packaging\installer.iss
Write-Host "Built NBL-Intelligence $version"
