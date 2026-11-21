@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\pythonw.exe" (
  echo Run NBL-Intelligence_Setup.bat once first.
  pause & exit /b 1
)
start "" ".venv\Scripts\pythonw.exe" -m nbl_intelligence
