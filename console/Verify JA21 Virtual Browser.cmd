@echo off
setlocal
call "%~dp0host\portable-env.cmd" || exit /b %ERRORLEVEL%
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0host\Verify-JA21Browser.ps1"
set "EC=%ERRORLEVEL%"
if not "%EC%"=="0" pause
exit /b %EC%
