@echo off
setlocal
cd /d "%~dp0"

echo.
echo  ==========================================
echo        NOVARIS AGRO - INICIALIZADOR
echo  ==========================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\iniciar-novaris-agro.ps1"

if errorlevel 1 (
  echo.
  echo Nao foi possivel iniciar o Novaris Agro.
  echo Leia a mensagem acima para saber o que precisa ser corrigido.
  echo.
  pause
)

endlocal
