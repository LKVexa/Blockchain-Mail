@echo off
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0Protection-Tools.ps1" -Action export-open
set "workspaceResult=%errorlevel%"
pause
exit /b %workspaceResult%
