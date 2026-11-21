# Creates NBL-Intelligence shortcuts on the desktop and in the Start menu.
$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root ".venv\Scripts\pythonw.exe"
$icon = Join-Path $root "assets\nbl-intelligence.ico"
$shell = New-Object -ComObject WScript.Shell
$places = @([Environment]::GetFolderPath("Desktop"), (Join-Path ([Environment]::GetFolderPath("StartMenu")) "Programs"))
foreach ($p in $places) {
  $lnk = $shell.CreateShortcut((Join-Path $p "NBL-Intelligence.lnk"))
  $lnk.TargetPath = $target
  $lnk.Arguments = "-m nbl_intelligence"
  $lnk.WorkingDirectory = $root
  $lnk.IconLocation = $icon
  $lnk.Description = "NBL-Intelligence - water intelligence for Nature Based Living sites"
  $lnk.Save()
}
Write-Host "  Shortcuts created."
