@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\parar-novaris-agro.ps1"
echo.
pause
endlocal
