@echo off
setlocal
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0Native-Protection-Tools.ps1" -Action native-open
set "workspaceExit=%errorlevel%"
pause
exit /b %workspaceExit%
