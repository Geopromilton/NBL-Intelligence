@echo off
setlocal
title NBL-Intelligence - one-time setup
cd /d "%~dp0"
echo.
echo  NBL-Intelligence 1.0 - one-time setup
echo  -------------------------------------
echo  This creates a private Python environment in this folder, installs the
echo  packages, prepares the 3D site twin and the document index, and puts a
echo  NBL-Intelligence shortcut on the desktop and in the Start menu.
echo.

set "PY="
where py >nul 2>nul && (py -3.13 -c "import sys" >nul 2>nul && set "PY=py -3.13")
if not defined PY where py >nul 2>nul && (py -3.12 -c "import sys" >nul 2>nul && set "PY=py -3.12")
if not defined PY where py >nul 2>nul && (py -3.11 -c "import sys" >nul 2>nul && set "PY=py -3.11")
if not defined PY where python >nul 2>nul && set "PY=python"
if not defined PY (
  echo  Python 3.11 or newer was not found. Install it from python.org, then run this file again.
  pause & exit /b 1
)
echo  Using %PY%

if not exist ".venv\Scripts\python.exe" (
  %PY% -m venv .venv || (echo  Could not create the environment. & pause & exit /b 1)
)
".venv\Scripts\python.exe" -m pip install --upgrade pip >nul
".venv\Scripts\python.exe" -m pip install -e . || (echo  Package installation failed. & pause & exit /b 1)

echo.
echo  Preparing the 3D site twin and the document index (about one minute) ...
".venv\Scripts\python.exe" -m nbl_intelligence --prepare

echo.
echo  Creating shortcuts ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\make_shortcuts.ps1"

echo.
echo  Setup complete. Start NBL-Intelligence from the desktop icon.
echo  Add your NVIDIA API key once in Settings (a key saved in NBL-AquaTwin is found automatically).
pause
