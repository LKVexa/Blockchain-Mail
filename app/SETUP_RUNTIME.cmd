@echo off
setlocal
powershell.exe -NoLogo -NoProfile -File "%~dp0SETUP_RUNTIME.ps1"
set "VEXA_EXIT=%ERRORLEVEL%"
echo.
echo Setup finished with exit code %VEXA_EXIT%.
echo No execution-policy or Smart App Control settings were changed.
pause
exit /b %VEXA_EXIT%
