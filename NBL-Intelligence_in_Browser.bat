@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Run NBL-Intelligence_Setup.bat once first.
  pause & exit /b 1
)
echo NBL-Intelligence is running at http://127.0.0.1:8780  -  close this window to stop it.
".venv\Scripts\python.exe" -m nbl_intelligence --browser
